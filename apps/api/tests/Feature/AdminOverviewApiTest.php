<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\SessionKind;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The console's overview.
 *
 * It answers "how is the protocol working", so everything it reads is a plain
 * column. The assertions below are mostly about it staying that way: no title,
 * no belief, no name, no email.
 */
final class AdminOverviewApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_overview_requires_an_admin(): void
    {
        $this->getJson('/api/admin/overview')->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/admin/overview')->assertNotFound();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs(User::factory()->coach()->create());
        $this->getJson('/api/admin/overview')->assertNotFound();
    }

    public function test_an_empty_install_reports_zeroes_rather_than_dividing_by_zero(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->getJson('/api/admin/overview')
            ->assertOk()
            ->assertJsonPath('sessions', 0)
            ->assertJsonPath('reachedFinalStepPct', 0)
            ->assertJsonPath('feltCalmerPct', 0)
            ->assertJsonPath('openFlags', 0)
            ->assertJsonPath('stepReach', [0, 0, 0, 0, 0, 0])
            ->assertJsonPath('recentSessions', []);
    }

    public function test_it_counts_sessions_in_the_window_only(): void
    {
        $user = User::factory()->create();
        $this->guidedSession($user, ['started_at' => now()->subDay()]);
        $this->guidedSession($user, ['started_at' => now()->subDays(30)]);

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/admin/overview')->assertJsonPath('sessions', 1);
    }

    public function test_the_percentages_are_of_sessions_started(): void
    {
        $user = User::factory()->create();

        // Four sessions: two finished and felt calmer, one finished and did
        // not, one stopped for safety and so has no journal row at all.
        foreach ([true, true, false] as $calmer) {
            $session = $this->guidedSession($user, ['end_reason' => 'completed']);
            JournalEntry::create([
                'user_id' => $user->id,
                'guided_session_id' => $session->id,
                'kind' => SessionKind::Full,
                'duration_minutes' => 12,
                'reached_final_step' => true,
                'calmer_rating' => $calmer ? CalmerRating::Yes : CalmerRating::No,
                'occurred_at' => now(),
                'feelings' => [],
                'title' => 'Something happened',
            ]);
        }
        $this->guidedSession($user, ['end_reason' => 'safety_stop']);

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/admin/overview')
            ->assertJsonPath('sessions', 4)
            // 3 of 4 reached step 6, and 2 of 4 felt calmer. The safety stop is
            // in the denominator: leaving it out would flatter both numbers.
            ->assertJsonPath('reachedFinalStepPct', 75)
            ->assertJsonPath('feltCalmerPct', 50);
    }

    public function test_step_reach_falls_away_rather_than_rising(): void
    {
        $user = User::factory()->create();
        $this->guidedSession($user, ['step_id' => 'notice']);
        $this->guidedSession($user, ['step_id' => 'feel']);
        $this->guidedSession($user, ['step_id' => null, 'end_reason' => 'completed']);

        Sanctum::actingAs(User::factory()->admin()->create());
        $reach = $this->getJson('/api/admin/overview')->json('stepReach');

        $this->assertSame([100, 67, 67, 33, 33, 33], $reach);

        // A funnel that climbs is a bug, not a surprising week.
        for ($i = 1; $i < count($reach); $i++) {
            $this->assertLessThanOrEqual($reach[$i - 1], $reach[$i]);
        }
    }

    public function test_it_names_nobody(): void
    {
        $user = User::factory()->create(['name' => 'Asha Rao', 'email' => 'asha@example.com']);
        $session = $this->guidedSession($user, ['end_reason' => 'completed']);
        JournalEntry::create([
            'user_id' => $user->id,
            'guided_session_id' => $session->id,
            'kind' => SessionKind::Full,
            'duration_minutes' => 9,
            'reached_final_step' => true,
            'calmer_rating' => CalmerRating::Yes,
            'occurred_at' => now(),
            'feelings' => ['angry'],
            'title' => 'My manager dismissed my work',
            'belief' => 'I am not good enough',
        ]);

        Sanctum::actingAs(User::factory()->admin()->create());
        $body = $this->getJson('/api/admin/overview')->assertOk()->content();

        $this->assertStringNotContainsString('Asha Rao', $body);
        $this->assertStringNotContainsString('asha@example.com', $body);
        // And none of the session's own text, which the console has no use for.
        $this->assertStringNotContainsString('My manager dismissed my work', $body);
        $this->assertStringNotContainsString('I am not good enough', $body);
    }

    public function test_the_recent_list_carries_a_handle_and_the_result(): void
    {
        $user = User::factory()->create();
        $this->guidedSession($user, ['end_reason' => 'safety_stop', 'step_id' => 'feel']);

        Sanctum::actingAs(User::factory()->admin()->create());
        $row = $this->getJson('/api/admin/overview')->json('recentSessions.0');

        $this->assertMatchesRegularExpression('/^u_[0-9a-f]{4}$/', $row['user']);
        $this->assertSame('safety', $row['result']);
        $this->assertSame(3, $row['reachedStep']);
        $this->assertGreaterThanOrEqual(1, $row['minutes']);
    }

    /** @param array<string, mixed> $attributes */
    private function guidedSession(User $user, array $attributes = []): GuidedSession
    {
        return GuidedSession::create(array_merge([
            'user_id' => $user->id,
            'kind' => 'full',
            'step_id' => 'notice',
            'started_at' => now()->subMinutes(10),
            'ended_at' => now(),
        ], $attributes));
    }
}
