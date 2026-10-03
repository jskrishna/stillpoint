<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\EndReason;
use App\Domain\SafetyLevel;
use App\Exceptions\SessionAlreadyEnded;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\User;
use App\Services\SessionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

/**
 * Two requests arriving at once for the same session.
 *
 * The pair that matters is a safety stop and an ordinary turn. The stop writes
 * an ended session; the ordinary turn — holding a copy of the state from before
 * the stop — used to write an un-ended one straight over it, and the session
 * carried on as though nobody had said anything. The domain's invariants (an
 * ended session is terminal, `safetyLevel` only rises) are enforced by the
 * reducer, and a stale snapshot walks past them without ever being refused.
 *
 * **These tests cannot create real concurrency.** The suite runs on sqlite in
 * one process, and `lockForUpdate()` is a no-op there. What they do is hold a
 * model object from before an end — which is exactly the state a second request
 * would be holding — and insist that acting on it is refused. The lock is what
 * makes that true on MySQL under genuine contention; this is what makes it true
 * at all.
 */
final class ConcurrentTurnTest extends TestCase
{
    use RefreshDatabase;

    private const CRISIS = 'I want to kill myself';

    private function consentedUser(): User
    {
        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_a_turn_held_from_before_a_safety_stop_cannot_undo_it(): void
    {
        $this->consentedUser();
        $id = $this->postJson('/api/sessions')->json('id');

        // What a second request holds: the row as it was before anything ended.
        $stale = GuidedSession::findOrFail($id);
        $this->assertFalse($stale->toDomain()->hasEnded());

        // The first request gets there and stops the session.
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => self::CRISIS])
            ->assertOk()
            ->assertJsonPath('ended', true);

        $stopped = GuidedSession::findOrFail($id)->step_id;

        // The second request now runs with its stale copy. It must be refused,
        // not quietly applied: applying it would end with an open session that
        // somebody has already told this product they are not safe in.
        $this->expectException(SessionAlreadyEnded::class);

        try {
            app(SessionService::class)->takeTurn($stale, 'my manager said something unfair to me');
        } finally {
            $after = GuidedSession::findOrFail($id);
            $this->assertTrue($after->toDomain()->hasEnded());
            $this->assertSame(EndReason::SafetyStop, $after->toDomain()->endReason);

            // `end_reason` alone is not enough to assert on, and finding that
            // out is why this test is worth having. Eloquent writes only the
            // attributes it sees as dirty, and on a stale model `end_reason`
            // reads null-to-null — so the stop survives by luck rather than by
            // design. What does not survive is everything `storeDomain()`
            // writes unconditionally. An ended session has no current step, and
            // without the lock the stale turn hands it one: the row comes back
            // ended, at step 2, with its safety level written back down. That
            // is a session the screens would happily carry on rendering.
            $this->assertSame(SafetyLevel::High, $after->toDomain()->safetyLevel);
            $this->assertNull($stopped, 'a stopped session has no current step');
            $this->assertSame($stopped, $after->step_id);
        }
    }

    public function test_the_route_answers_409_rather_than_carrying_on(): void
    {
        $this->consentedUser();
        $id = $this->postJson('/api/sessions')->json('id');

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => self::CRISIS])
            ->assertOk();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'and another thing'])
            ->assertStatus(Response::HTTP_CONFLICT);

        // Still stopped, still for safety, and still no journal row — the three
        // things that must survive anything arriving afterwards.
        $after = GuidedSession::findOrFail($id);
        $this->assertSame(EndReason::SafetyStop, $after->toDomain()->endReason);
        $this->assertDatabaseMissing('journal_entries', ['guided_session_id' => $id]);
    }

    public function test_a_stale_stop_does_not_relabel_a_safety_stop(): void
    {
        $this->consentedUser();
        $id = $this->postJson('/api/sessions')->json('id');
        $stale = GuidedSession::findOrFail($id);

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => self::CRISIS])->assertOk();

        // Stopping is not refused — the user asking to leave something that has
        // already ended is harmless — but it must not rewrite why it ended, or
        // the queue and the journal would disagree about what happened.
        app(SessionService::class)->stop($stale);

        $after = GuidedSession::findOrFail($id);
        $this->assertSame(EndReason::SafetyStop, $after->toDomain()->endReason);
        $this->assertDatabaseMissing('journal_entries', ['guided_session_id' => $id]);
    }

    public function test_one_journal_row_per_session_even_from_a_stale_copy(): void
    {
        $this->consentedUser();
        $id = $this->postJson('/api/sessions')->json('id');
        $stale = GuidedSession::findOrFail($id);

        $this->postJson("/api/sessions/{$id}/stop")->assertOk();
        $this->assertSame(1, JournalEntry::where('guided_session_id', $id)->count());

        // The second stop runs from a copy taken before the first, so its own
        // "has this been journalled?" check was true when it was read.
        app(SessionService::class)->stop($stale);

        $this->assertSame(1, JournalEntry::where('guided_session_id', $id)->count());
    }

    public function test_two_starts_leave_one_open_session(): void
    {
        $user = $this->consentedUser();

        $first = $this->postJson('/api/sessions')->json('id');
        $second = $this->postJson('/api/sessions')->json('id');

        $this->assertNotSame($first, $second);

        $open = GuidedSession::where('user_id', $user->id)
            ->whereNull('ended_at')
            ->whereNull('end_reason')
            ->count();

        // One at a time, because a person is in one at a time. Two would both
        // offer to be resumed with no way to tell which an answer went into.
        $this->assertSame(1, $open);
    }
}
