<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\EndReason;
use App\Domain\SafetyLevel;
use App\Domain\SessionKind;
use App\Domain\StepId;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The console answers "how is the protocol working", and reads nobody's words.
 *
 * Two things were wrong with how it answered, and both came from the same
 * place: there was no plain column saying how far a session got, so the
 * overview built every session's domain object to work it out — which reads
 * `data`, the encrypted column — and then got the answer wrong anyway, because
 * ending a session sets `step_id` to null and the code read that null as "all
 * six steps".
 */
final class OverviewReadsPlainColumnsTest extends TestCase
{
    use RefreshDatabase;

    private function guided(User $user, array $attributes): GuidedSession
    {
        return GuidedSession::create(array_merge([
            'user_id' => $user->id,
            'kind' => SessionKind::Full,
            'protocol_version' => '1.0',
            'safety_level' => SafetyLevel::None,
            'started_at' => now()->subMinutes(20),
        ], $attributes));
    }

    /** The bug this closes, stated as a test. */
    public function test_a_session_stopped_at_step_one_did_not_reach_step_six(): void
    {
        $user = User::factory()->create();
        $this->guided($user, [
            'step_id' => null,
            'furthest_step_id' => StepId::Notice,
            'end_reason' => EndReason::SafetyStop,
            'safety_level' => SafetyLevel::High,
            'ended_at' => now()->subMinutes(19),
        ]);

        Sanctum::actingAs(User::factory()->admin()->create());
        $overview = $this->getJson('/api/admin/overview')->assertOk();

        // It reached step 1 and no further. The screen used to say it reached
        // every step, while `reachedFinalStepPct` beside it said none did.
        $this->assertSame([100, 0, 0, 0, 0, 0], $overview->json('stepReach'));
        $this->assertSame(0, $overview->json('reachedFinalStepPct'));
        $this->assertSame(1, $overview->json('recentSessions.0.reachedStep'));
        $this->assertSame('safety', $overview->json('recentSessions.0.result'));
    }

    public function test_a_session_the_user_stopped_reports_where_they_stopped(): void
    {
        $user = User::factory()->create();
        $this->guided($user, [
            'step_id' => null,
            'furthest_step_id' => StepId::Feel,
            'end_reason' => EndReason::UserStopped,
            'ended_at' => now()->subMinutes(15),
        ]);

        Sanctum::actingAs(User::factory()->admin()->create());
        $overview = $this->getJson('/api/admin/overview')->assertOk();

        $this->assertSame([100, 100, 100, 0, 0, 0], $overview->json('stepReach'));
        $this->assertSame(3, $overview->json('recentSessions.0.reachedStep'));
    }

    public function test_a_completed_session_does_reach_every_step(): void
    {
        $user = User::factory()->create();
        $session = $this->guided($user, [
            'step_id' => null,
            'furthest_step_id' => StepId::Forgive,
            'end_reason' => EndReason::Completed,
            'ended_at' => now()->subMinutes(5),
        ]);
        JournalEntry::create([
            'user_id' => $user->id,
            'guided_session_id' => $session->id,
            'kind' => SessionKind::Full,
            'title' => 'Called out at work',
            'feelings' => ['anger'],
            'duration_minutes' => 15,
            'reached_final_step' => true,
            'calmer_rating' => CalmerRating::Yes,
            'occurred_at' => now()->subMinutes(5),
        ]);

        Sanctum::actingAs(User::factory()->admin()->create());
        $overview = $this->getJson('/api/admin/overview')->assertOk();

        $this->assertSame([100, 100, 100, 100, 100, 100], $overview->json('stepReach'));
        $this->assertSame(100, $overview->json('reachedFinalStepPct'));
        $this->assertSame(6, $overview->json('recentSessions.0.reachedStep'));
        $this->assertSame('yes', $overview->json('recentSessions.0.result'));
    }

    /**
     * The funnel cannot climb, and the two numbers on the screen cannot
     * disagree: the last step's reach is what `reachedFinalStepPct` counts,
     * for a set of sessions that all either completed or stopped.
     */
    public function test_the_funnel_falls_away_and_agrees_with_the_final_step_figure(): void
    {
        $user = User::factory()->create();
        $this->guided($user, ['step_id' => StepId::Notice, 'furthest_step_id' => StepId::Notice]);
        $this->guided($user, ['step_id' => StepId::Feel, 'furthest_step_id' => StepId::Feel]);
        $this->guided($user, [
            'step_id' => null,
            'furthest_step_id' => StepId::Responsibility,
            'end_reason' => EndReason::SafetyStop,
            'safety_level' => SafetyLevel::High,
            'ended_at' => now(),
        ]);
        $completed = $this->guided($user, [
            'step_id' => null,
            'furthest_step_id' => StepId::Forgive,
            'end_reason' => EndReason::Completed,
            'ended_at' => now(),
        ]);
        JournalEntry::create([
            'user_id' => $user->id,
            'guided_session_id' => $completed->id,
            'kind' => SessionKind::Full,
            'title' => 'Finished one',
            'feelings' => [],
            'duration_minutes' => 12,
            'reached_final_step' => true,
            'occurred_at' => now(),
        ]);

        Sanctum::actingAs(User::factory()->admin()->create());
        $overview = $this->getJson('/api/admin/overview')->assertOk();
        $reach = $overview->json('stepReach');

        $this->assertSame([100, 75, 50, 25, 25, 25], $reach);
        $this->assertSame($reach[StepId::count() - 1], $overview->json('reachedFinalStepPct'));

        for ($i = 1; $i < count($reach); $i++) {
            $this->assertLessThanOrEqual($reach[$i - 1], $reach[$i], 'a funnel that climbs is a bug');
        }
    }

    /**
     * And it never reads the words.
     *
     * Asserted on the SQL, because there is nothing in the response to see it
     * by: this screen prints a step number and a rating either way, so the
     * version that decrypted every session in the window looked identical
     * from outside.
     */
    public function test_the_overview_never_selects_the_session_or_journal_text(): void
    {
        $user = User::factory()->create();
        $session = $this->guided($user, [
            'step_id' => null,
            'furthest_step_id' => StepId::Forgive,
            'end_reason' => EndReason::Completed,
            'ended_at' => now(),
            'data' => ['whatHappened' => 'what they said in the session'],
        ]);
        JournalEntry::create([
            'user_id' => $user->id,
            'guided_session_id' => $session->id,
            'kind' => SessionKind::Full,
            'title' => 'a title the console must not read',
            'what_happened' => 'nor this',
            'belief' => 'nor this',
            'feelings' => [],
            'duration_minutes' => 12,
            'reached_final_step' => true,
            'calmer_rating' => CalmerRating::ALittle,
            'occurred_at' => now(),
        ]);

        $queries = [];
        DB::listen(function ($query) use (&$queries): void {
            $queries[] = $query->sql;
        });

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/admin/overview')->assertOk();

        $reads = array_values(array_filter($queries, static fn (string $sql) => str_contains($sql, 'guided_sessions')
            || str_contains($sql, 'journal_entries')));

        $this->assertNotEmpty($reads, 'the overview should read those tables at all');

        foreach ($reads as $sql) {
            $this->assertStringNotContainsString('select *', $sql, "selected everything: {$sql}");
            foreach (['data', 'title', 'what_happened', 'belief', 'forgiveness', 'memory', 'note'] as $column) {
                $this->assertStringNotContainsString("\"{$column}\"", $sql, "selected {$column}: {$sql}");
                $this->assertStringNotContainsString("`{$column}`", $sql, "selected {$column}: {$sql}");
            }
        }
    }
}
