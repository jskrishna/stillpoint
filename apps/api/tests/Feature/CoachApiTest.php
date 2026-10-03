<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\ClientStatus;
use App\Domain\EndReason;
use App\Domain\SafetyCategory;
use App\Domain\SafetyLevel;
use App\Domain\SessionKind;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The coach portal.
 *
 * "You only see sessions your clients choose to share." Almost everything here
 * is that sentence, checked from the outside: not that an unshared session is
 * hidden on a screen, but that its text is absent from the response.
 */
final class CoachApiTest extends TestCase
{
    use RefreshDatabase;

    private const PRIVATE_TITLE = 'Something I am not ready to discuss';

    private const PRIVATE_BELIEF = 'I am unlovable';

    private const SHARED_TITLE = 'My manager dismissed my work';

    public function test_the_portal_requires_a_coach(): void
    {
        $this->getJson('/api/coach/clients')->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/coach/clients')->assertNotFound();
    }

    public function test_an_admin_is_not_a_coach(): void
    {
        // Two different trusts. Holding one does not imply the other.
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/coach/clients')->assertNotFound();
    }

    public function test_a_coach_sees_only_their_own_clients(): void
    {
        $coach = User::factory()->coach()->create();
        $mine = User::factory()->create(['name' => 'My Client']);
        $theirs = User::factory()->create(['name' => 'Someone Else']);
        $this->pair($coach, $mine);
        $this->pair(User::factory()->coach()->create(), $theirs);

        Sanctum::actingAs($coach);
        $names = array_column($this->getJson('/api/coach/clients')->assertOk()->json(), 'name');

        $this->assertSame(['My Client'], $names);
    }

    public function test_a_coach_cannot_read_a_client_who_is_not_theirs(): void
    {
        $coach = User::factory()->coach()->create();
        $stranger = User::factory()->create();
        $this->entry($stranger, ['title' => self::PRIVATE_TITLE, 'shared_with_coach' => true]);

        Sanctum::actingAs($coach);
        $response = $this->getJson("/api/coach/clients/{$stranger->id}")->assertNotFound();
        $this->assertStringNotContainsString(self::PRIVATE_TITLE, $response->content());

        $this->patchJson("/api/coach/clients/{$stranger->id}", ['coachNotes' => 'mine now'])
            ->assertNotFound();
    }

    public function test_an_unshared_session_never_reaches_the_coach(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $this->pair($coach, $client);

        $this->entry($client, [
            'title' => self::SHARED_TITLE,
            'belief' => 'I am not good enough',
            'shared_with_coach' => true,
        ]);
        $this->entry($client, [
            'title' => self::PRIVATE_TITLE,
            'belief' => self::PRIVATE_BELIEF,
            'note' => 'a note nobody else should read',
            'shared_with_coach' => false,
        ]);

        Sanctum::actingAs($coach);
        $body = $this->getJson("/api/coach/clients/{$client->id}")->assertOk()->content();

        $this->assertStringContainsString(self::SHARED_TITLE, $body);
        // Not hidden — absent.
        $this->assertStringNotContainsString(self::PRIVATE_TITLE, $body);
        $this->assertStringNotContainsString(self::PRIVATE_BELIEF, $body);
        $this->assertStringNotContainsString('a note nobody else should read', $body);
    }

    public function test_the_shared_count_counts_only_shared_sessions(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $this->pair($coach, $client);

        $this->entry($client, ['shared_with_coach' => true]);
        $this->entry($client, ['shared_with_coach' => true]);
        $this->entry($client, ['shared_with_coach' => false]);

        Sanctum::actingAs($coach);
        $this->getJson('/api/coach/clients')->assertJsonPath('0.sharedCount', 2);
        $this->getJson("/api/coach/clients/{$client->id}")
            ->assertJsonPath('sharedCount', 2)
            ->assertJsonCount(2, 'sharedSessions');
    }

    public function test_the_recurring_belief_is_drawn_from_shared_sessions_only(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $this->pair($coach, $client);

        // Said twice, but only in sessions the client kept to themselves. A
        // belief that comes back is the coach's most useful signal, which is
        // exactly why it must not be built from private sessions.
        $this->entry($client, ['belief' => self::PRIVATE_BELIEF, 'shared_with_coach' => false]);
        $this->entry($client, ['belief' => self::PRIVATE_BELIEF, 'shared_with_coach' => false]);
        $this->entry($client, ['belief' => 'I am not good enough', 'shared_with_coach' => true]);

        Sanctum::actingAs($coach);
        $response = $this->getJson("/api/coach/clients/{$client->id}")->assertOk();

        $this->assertNull($response->json('recurringBelief'));
        $this->assertStringNotContainsString(self::PRIVATE_BELIEF, $response->content());
    }

    public function test_a_coach_is_told_a_session_stopped_for_safety_but_not_what_was_said(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $this->pair($coach, $client);

        $session = GuidedSession::create([
            'user_id' => $client->id,
            'kind' => 'full',
            'step_id' => 'feel',
            'end_reason' => EndReason::SafetyStop,
            'started_at' => now()->subMinutes(8),
            'ended_at' => now(),
        ]);
        SafetyFlag::create([
            'user_id' => $client->id,
            'guided_session_id' => $session->id,
            'level' => SafetyLevel::High,
            'category' => SafetyCategory::SelfHarm,
            'excerpt' => 'the words a reviewer reads and a coach does not',
            'outcome' => 'Session stopped. Helplines shown.',
            'status' => 'open',
            'raised_at' => now(),
        ]);

        Sanctum::actingAs($coach);
        $response = $this->getJson("/api/coach/clients/{$client->id}")->assertOk();

        // The product tells them it happened, because the journal cannot: a
        // safety-stopped session is never journalled.
        $this->assertCount(1, $response->json('attention'));
        $this->assertNotNull($response->json('attention.0.at'));
        $this->assertStringContainsString('stopped for safety', $response->json('attention.0.reason'));

        // And not a word of it.
        $this->assertStringNotContainsString('the words a reviewer reads', $response->content());
    }

    public function test_a_coach_cannot_reach_the_safety_queue(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $this->pair($coach, $client);
        $flag = SafetyFlag::create([
            'user_id' => $client->id,
            'guided_session_id' => null,
            'level' => SafetyLevel::High,
            'category' => SafetyCategory::SelfHarm,
            'excerpt' => 'not for a coach',
            'outcome' => 'Session stopped.',
            'status' => 'open',
            'raised_at' => now(),
        ]);

        Sanctum::actingAs($coach);
        $this->getJson('/api/admin/safety-flags')->assertNotFound();
        $response = $this->getJson("/api/admin/safety-flags/{$flag->id}")->assertNotFound();
        $this->assertStringNotContainsString('not for a coach', $response->content());
    }

    public function test_the_coachs_notes_are_saved_and_trimmed(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $this->pair($coach, $client);

        Sanctum::actingAs($coach);
        $this->patchJson("/api/coach/clients/{$client->id}", [
            'coachNotes' => '  Wants to talk about her mother.  ',
        ])->assertOk()->assertJsonPath('coachNotes', 'Wants to talk about her mother.');

        $this->getJson("/api/coach/clients/{$client->id}")
            ->assertJsonPath('coachNotes', 'Wants to talk about her mother.');
    }

    public function test_setting_the_next_call_does_not_clear_the_notes(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $this->pair($coach, $client);

        Sanctum::actingAs($coach);
        $this->patchJson("/api/coach/clients/{$client->id}", ['coachNotes' => 'Keep this.']);
        $this->patchJson("/api/coach/clients/{$client->id}", [
            'nextCallAt' => now()->addDay()->toIso8601String(),
        ])->assertOk()->assertJsonPath('coachNotes', 'Keep this.');
    }

    public function test_a_client_with_nothing_shared_reads_as_empty(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $this->pair($coach, $client);

        Sanctum::actingAs($coach);
        $this->getJson("/api/coach/clients/{$client->id}")
            ->assertOk()
            ->assertJsonPath('status', 'active')
            ->assertJsonPath('sharedCount', 0)
            ->assertJsonPath('recurringBelief', null)
            ->assertJsonPath('sharedSessions', []);
    }

    /**
     * A pairing row that does not say `active` grants nothing.
     *
     * Nothing writes one — accepting an invitation is the only thing that
     * creates a pairing, and it writes `active`. This exists because the row
     * used to be able to say `invited`, from before invitations had their own
     * table, and a coach would have read shared entries through a pairing the
     * client never agreed to. Sharing is a property of the journal entry, not
     * of the pairing, so "they have not accepted yet" would not have saved it.
     */
    public function test_a_pairing_that_is_not_active_grants_nothing(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();

        // Written past the model, because the pivot's cast now refuses to
        // write anything else — which is itself part of the guarantee. What
        // this stands in for is a row left behind by an older schema.
        DB::table('coach_client')->insert([
            'coach_id' => $coach->id,
            'client_id' => $client->id,
            'status' => 'invited',
            'since' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($coach);
        $this->getJson('/api/coach/clients')->assertOk()->assertJsonCount(0);
        $this->getJson("/api/coach/clients/{$client->id}")->assertNotFound();

        // And the client is not told they have a coach who cannot read them.
        Sanctum::actingAs($client);
        $this->getJson('/api/me/coaches')->assertOk()->assertJsonCount(0);
    }

    private function pair(User $coach, User $client): void
    {
        $coach->clients()->attach($client->id, [
            'status' => ClientStatus::Active->value,
            'since' => now()->subMonths(3),
        ]);
    }

    /** @param array<string, mixed> $attributes */
    private function entry(User $user, array $attributes = []): JournalEntry
    {
        return JournalEntry::create(array_merge([
            'user_id' => $user->id,
            'guided_session_id' => null,
            'kind' => SessionKind::Full,
            'duration_minutes' => 12,
            'reached_final_step' => true,
            'calmer_rating' => CalmerRating::Yes,
            'occurred_at' => now()->subDays(random_int(1, 20)),
            'feelings' => ['angry'],
            'title' => 'A session',
            'shared_with_coach' => false,
        ], $attributes));
    }
}
