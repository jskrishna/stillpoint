<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\EndReason;
use App\Domain\StepId;
use App\Domain\UserHandle;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use Illuminate\Support\Carbon;

/**
 * The console's figures, computed rather than printed.
 *
 * All of this reads plain columns — kind, step, end reason, rating. It
 * deliberately touches none of the encrypted text: the console answers "how is
 * the protocol working", not "what did people say". The one place staff read
 * someone's words is the safety queue, which is its own screen with its own
 * reason.
 *
 * The figures are across all users, which is what makes them aggregate and not
 * a view of anyone. The recent-sessions list is the exception and shows a
 * handful of rows, so it carries an opaque handle rather than a user.
 */
final readonly class AdminOverviewService
{
    public const WINDOW_DAYS = 7;

    /** How many recent sessions the overview lists. */
    private const RECENT = 6;

    /** @return array<string, mixed> */
    public function forWindow(?Carbon $now = null, int $windowDays = self::WINDOW_DAYS): array
    {
        $since = ($now ?? now())->copy()->subDays($windowDays);

        $started = GuidedSession::query()->where('started_at', '>=', $since);
        $sessions = (clone $started)->count();
        $entries = JournalEntry::query()->where('occurred_at', '>=', $since);

        $reachedFinal = (clone $entries)->where('reached_final_step', true)->count();
        $feltCalmer = (clone $entries)->where('calmer_rating', 'yes')->count();

        return [
            'windowDays' => $windowDays,
            'sessions' => $sessions,
            // Of the sessions started, not of the journal rows: a session that
            // stopped for safety has no row, and leaving it out of the
            // denominator would flatter the number.
            'reachedFinalStepPct' => self::percent($reachedFinal, $sessions),
            'feltCalmerPct' => self::percent($feltCalmer, $sessions),
            'openFlags' => SafetyFlag::query()->open()->count(),
            // Not in the window: a flag raised three weeks ago and still open
            // is exactly the thing this number is for. A queue nobody is
            // getting through is the safeguarding failure, and a count on its
            // own cannot show it — four open flags is reassuring until you
            // learn the oldest has been waiting six days.
            //
            // `select('raised_at')` so the excerpt is never even fetched, and
            // an ISO string rather than `min()`'s bare SQL datetime: that has
            // no timezone on it, and a browser reads "2026-10-03 13:00:00" as
            // its own local time, which is the wrong answer everywhere except
            // UTC.
            'oldestOpenFlagAt' => SafetyFlag::query()->open()
                ->select('raised_at')->orderBy('raised_at')->first()
                ?->raised_at?->toIso8601String(),
            // Not a protocol figure — a figure about this screen's own reach.
            // The phrase screen reads Latin and Devanagari and nothing else,
            // so these are the sessions where somebody said something it could
            // not read, which is the number that says whether the next
            // language is worth covering. See `packages/protocol/src/risk.ts`.
            'unreadableSessions' => (clone $started)->where('unreadable_turns', '>', 0)->count(),
            'unreadableTurns' => (int) (clone $started)->sum('unreadable_turns'),
            'stepReach' => $this->stepReach($since, $sessions),
            'recentSessions' => $this->recent(),
        ];
    }

    /**
     * How many of every 100 sessions reach each step.
     *
     * A session's furthest step is where it is now, or the last step if it
     * finished — the reducer only ever moves forward, so the current step is
     * also the high-water mark.
     *
     * @return list<int>
     */
    private function stepReach(Carbon $since, int $sessions): array
    {
        if ($sessions === 0) {
            return array_fill(0, StepId::count(), 0);
        }

        $furthest = [];
        foreach (GuidedSession::query()->where('started_at', '>=', $since)->get() as $session) {
            $domain = $session->toDomain();
            $furthest[] = $domain->stepId?->ordinal() ?? StepId::count();
        }

        $reach = [];
        foreach (StepId::ordered() as $step) {
            $n = count(array_filter($furthest, fn (int $o) => $o >= $step->ordinal()));
            $reach[] = self::percent($n, $sessions);
        }

        return $reach;
    }

    /** @return list<array<string, mixed>> */
    private function recent(): array
    {
        $rows = [];
        $sessions = GuidedSession::query()
            ->orderByDesc('started_at')
            ->limit(self::RECENT)
            ->get();

        foreach ($sessions as $session) {
            $domain = $session->toDomain();
            $entry = JournalEntry::query()
                ->where('guided_session_id', $session->id)
                ->first();

            $rows[] = [
                'user' => UserHandle::for($session->user_id),
                'kind' => $domain->kind->value,
                'minutes' => self::minutes($session),
                // Where it got to, 1-based, or 6 once it has finished.
                'reachedStep' => $domain->stepId?->ordinal() ?? StepId::count(),
                'result' => self::result($session, $entry),
            ];
        }

        return $rows;
    }

    private static function result(GuidedSession $session, ?JournalEntry $entry): string
    {
        // Compared as the enum, not the string: end_reason is cast, so
        // `=== 'safety_stop'` is quietly always false.
        if ($session->end_reason === EndReason::SafetyStop) {
            return 'safety';
        }

        return $entry?->calmer_rating?->value ?? 'unrated';
    }

    private static function minutes(GuidedSession $session): int
    {
        $ended = $session->ended_at ?? now();

        return max(1, (int) round($session->started_at->diffInSeconds($ended) / 60));
    }

    private static function percent(int $part, int $whole): int
    {
        return $whole === 0 ? 0 : (int) round(($part / $whole) * 100);
    }
}
