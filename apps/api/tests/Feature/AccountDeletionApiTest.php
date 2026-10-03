<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\SafetyCategory;
use App\Domain\SafetyLevel;
use App\Domain\SessionKind;
use App\Http\Controllers\Api\AuthController;
use App\Models\CoachInvite;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Erasing an account.
 *
 * This product holds the most personal text a person is likely to type. Being
 * able to take it back has to be reachable by them, and it has to actually take
 * everything rather than hide it — which is what most of this asserts.
 */
final class AccountDeletionApiTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-battery-staple';

    public function test_erasing_needs_a_token(): void
    {
        $this->deleteJson('/api/me', [
            'password' => self::PASSWORD,
            'confirm' => AuthController::DELETE_CONFIRMATION,
        ])->assertUnauthorized();
    }

    public function test_the_wrong_password_erases_nothing(): void
    {
        $user = $this->userWithEverything();

        Sanctum::actingAs($user);
        $this->deleteJson('/api/me', [
            'password' => 'not-the-password',
            'confirm' => AuthController::DELETE_CONFIRMATION,
        ])->assertUnprocessable();

        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->assertSame(1, JournalEntry::query()->where('user_id', $user->id)->count());
    }

    public function test_the_confirmation_must_be_typed_out(): void
    {
        $user = $this->userWithEverything();

        Sanctum::actingAs($user);
        // A password alone is not enough: it should be an act, not a reflex,
        // and this is not reversible.
        $this->deleteJson('/api/me', ['password' => self::PASSWORD, 'confirm' => 'yes'])
            ->assertUnprocessable();

        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_erasing_takes_everything_the_account_owned(): void
    {
        $user = $this->userWithEverything();
        $coach = User::factory()->coach()->create();
        $coach->clients()->attach($user->id, ['status' => 'active', 'since' => now()]);

        Sanctum::actingAs($user);
        $response = $this->deleteJson('/api/me', [
            'password' => self::PASSWORD,
            'confirm' => AuthController::DELETE_CONFIRMATION,
        ])->assertOk();

        // It reports what went, rather than asserting that something happened.
        $this->assertSame(1, $response->json('removed.sessions'));
        $this->assertSame(1, $response->json('removed.journalEntries'));
        $this->assertSame(1, $response->json('removed.coaches'));

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertSame(0, GuidedSession::query()->where('user_id', $user->id)->count());
        $this->assertSame(0, JournalEntry::query()->where('user_id', $user->id)->count());
        // Including the safety flag, which holds the most sensitive text in the
        // schema. See CLAUDE.md: whether a flag should outlive an erasure is an
        // open question, and deleting it is the answer that needs no sign-off.
        $this->assertSame(0, SafetyFlag::query()->where('user_id', $user->id)->count());
        $this->assertSame(0, $coach->clients()->count());
    }

    public function test_erasing_revokes_every_token(): void
    {
        $user = $this->userWithEverything();
        $token = $user->createToken('another device')->plainTextToken;

        Sanctum::actingAs($user);
        $this->deleteJson('/api/me', [
            'password' => self::PASSWORD,
            'confirm' => AuthController::DELETE_CONFIRMATION,
        ])->assertOk();

        // Tokens have no foreign key, so nothing would take them with it. A
        // live token for a deleted account is the worst kind of leftover.
        $this->assertSame(0, \DB::table('personal_access_tokens')->count());

        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/me')
            ->assertUnauthorized();
    }

    public function test_erasing_leaves_everybody_elses_data_alone(): void
    {
        $mine = $this->userWithEverything();
        $theirs = $this->userWithEverything('theirs@example.com');

        Sanctum::actingAs($mine);
        $this->deleteJson('/api/me', [
            'password' => self::PASSWORD,
            'confirm' => AuthController::DELETE_CONFIRMATION,
        ])->assertOk();

        $this->assertDatabaseHas('users', ['id' => $theirs->id]);
        $this->assertSame(1, JournalEntry::query()->where('user_id', $theirs->id)->count());
        $this->assertSame(1, SafetyFlag::query()->where('user_id', $theirs->id)->count());
    }

    public function test_a_coachs_invitations_go_with_them(): void
    {
        $coach = User::factory()->coach()->create(['password' => self::PASSWORD]);
        $invite = CoachInvite::open($coach, 'asha@example.com');

        Sanctum::actingAs($coach);
        $this->deleteJson('/api/me', [
            'password' => self::PASSWORD,
            'confirm' => AuthController::DELETE_CONFIRMATION,
        ])->assertOk();

        // An invitation from an account that no longer exists is a link to
        // nowhere, so it should not still be acceptable.
        $this->assertDatabaseMissing('coach_invites', ['id' => $invite->id]);
        $this->getJson("/api/invites/{$invite->token}")->assertNotFound();
    }

    public function test_the_same_address_can_register_again_afterwards(): void
    {
        $user = $this->userWithEverything('again@example.com');

        Sanctum::actingAs($user);
        $this->deleteJson('/api/me', [
            'password' => self::PASSWORD,
            'confirm' => AuthController::DELETE_CONFIRMATION,
        ])->assertOk();

        $this->app['auth']->forgetGuards();
        // Erasure is not a ban. And the new account starts empty, which is the
        // point of the old one being gone.
        $this->postJson('/api/auth/register', [
            'name' => 'Back Again',
            'email' => 'again@example.com',
            'password' => self::PASSWORD,
        ])->assertCreated();

        $fresh = User::query()->where('email', 'again@example.com')->sole();
        $this->assertSame(0, JournalEntry::query()->where('user_id', $fresh->id)->count());
    }

    private function userWithEverything(string $email = 'mine@example.com'): User
    {
        $user = User::factory()->create([
            'email' => $email,
            'password' => self::PASSWORD,
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);

        $session = GuidedSession::create([
            'user_id' => $user->id,
            'kind' => 'full',
            'step_id' => 'notice',
            'started_at' => now()->subMinutes(10),
            'ended_at' => now(),
        ]);

        JournalEntry::create([
            'user_id' => $user->id,
            'guided_session_id' => $session->id,
            'kind' => SessionKind::Full,
            'duration_minutes' => 10,
            'reached_final_step' => true,
            'calmer_rating' => CalmerRating::Yes,
            'occurred_at' => now(),
            'feelings' => ['angry'],
            'title' => 'Something that happened',
            'belief' => 'I am not good enough',
        ]);

        SafetyFlag::create([
            'user_id' => $user->id,
            'guided_session_id' => $session->id,
            'level' => SafetyLevel::Medium,
            'category' => SafetyCategory::SelfHarm,
            'excerpt' => 'something they said',
            'outcome' => 'Flagged for review.',
            'status' => 'open',
            'raised_at' => now(),
        ]);

        return $user->refresh();
    }
}
