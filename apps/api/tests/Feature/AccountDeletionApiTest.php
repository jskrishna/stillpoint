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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
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

    /**
     * The address itself, in the three tables that hold it without a key.
     *
     * Everything that cascades is covered elsewhere in this file. These three
     * are the ones a foreign key does not reach, so nothing about the schema
     * makes them true — only the service does, and only while somebody
     * remembers. An erasure that leaves the person's email address in the
     * database has not erased them.
     */
    public function test_erasing_takes_the_address_out_of_the_tables_that_have_no_key_to_it(): void
    {
        $user = User::factory()->create([
            'email' => 'Aarav@Example.com',
            'password' => Hash::make(self::PASSWORD),
        ]);
        $coach = User::factory()->coach()->create();

        // An invitation sent *to* them, which is keyed by the address because
        // the invitee may not have had an account when it was sent. Only the
        // ones a coach sends cascade.
        $invite = CoachInvite::open($coach, 'aarav@example.com');

        // A pending reset, which lives in a table whose primary key is the
        // address.
        Password::broker()->sendResetLink(['email' => $user->email]);
        $this->assertDatabaseCount('password_reset_tokens', 1);

        // A web session row. Nothing writes one today — auth is bearer tokens
        // — so this stands in for the day cookie mode lands, when `user_id` is
        // a plain indexed column with no cascade behind it.
        DB::table('sessions')->insert([
            'id' => 'a-web-session',
            'user_id' => $user->id,
            'ip_address' => '203.0.113.7',
            'user_agent' => 'a browser',
            'payload' => 'x',
            'last_activity' => time(),
        ]);

        Sanctum::actingAs($user);
        $this->deleteJson('/api/me', [
            'password' => self::PASSWORD,
            'confirm' => AuthController::DELETE_CONFIRMATION,
        ])->assertOk()->assertJsonPath('removed.invites', 1);

        $this->assertDatabaseMissing('coach_invites', ['id' => $invite->id]);
        $this->assertDatabaseCount('password_reset_tokens', 0);
        $this->assertDatabaseMissing('sessions', ['id' => 'a-web-session']);

        // And not by coincidence: the address is nowhere in any of them. The
        // stored invite was lowercased and the account's was not, which is the
        // mismatch a case-sensitive comparison would have passed over.
        foreach (['coach_invites' => 'email', 'password_reset_tokens' => 'email'] as $table => $column) {
            $this->assertSame(
                0,
                DB::table($table)->whereRaw("LOWER({$column}) = ?", ['aarav@example.com'])->count(),
                "{$table} still holds the erased address",
            );
        }
    }

    public function test_an_invitation_to_somebody_else_is_left_alone(): void
    {
        // The sweep is by address, so it has to be the right address. A coach
        // losing every pending invitation because one invitee left would be a
        // worse bug than the one being fixed.
        $user = User::factory()->create([
            'email' => 'aarav@example.com',
            'password' => Hash::make(self::PASSWORD),
        ]);
        $coach = User::factory()->coach()->create();
        $theirs = CoachInvite::open($coach, 'aarav@example.com');
        $someone = CoachInvite::open($coach, 'diya@example.com');

        Sanctum::actingAs($user);
        $this->deleteJson('/api/me', [
            'password' => self::PASSWORD,
            'confirm' => AuthController::DELETE_CONFIRMATION,
        ])->assertOk();

        $this->assertDatabaseMissing('coach_invites', ['id' => $theirs->id]);
        $this->assertDatabaseHas('coach_invites', ['id' => $someone->id]);
    }

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

    /**
     * The last admin cannot be demoted, and could erase themselves.
     *
     * Measured: the only admin sent `DELETE /me` with their own password and
     * the typed confirmation, and it answered 200 with zero admins left and an
     * open flag in a queue nobody could read. The guard was on the role route
     * alone.
     */
    public function test_the_only_admin_cannot_erase_their_own_account(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'password' => 'a-long-enough-password']);
        Sanctum::actingAs($admin);

        $this->deleteJson('/api/me', ['password' => 'a-long-enough-password', 'confirm' => 'DELETE'])
            ->assertStatus(409)
            ->assertJsonPath('message', fn (string $m) => str_contains($m, 'only admin'));

        $this->assertSame(1, User::query()->where('role', 'admin')->count());
    }

    public function test_an_admin_who_is_not_the_last_one_can(): void
    {
        // The control. A guard that refused every admin would pass the test
        // above and take erasure away from people entitled to it.
        User::factory()->create(['role' => 'admin']);
        $admin = User::factory()->create(['role' => 'admin', 'password' => 'a-long-enough-password']);
        Sanctum::actingAs($admin);

        $this->deleteJson('/api/me', ['password' => 'a-long-enough-password', 'confirm' => 'DELETE'])
            ->assertOk();

        $this->assertSame(1, User::query()->where('role', 'admin')->count());
        $this->assertNull(User::query()->find($admin->id));
    }
}
