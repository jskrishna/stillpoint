<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\CalmerRating;
use App\Domain\EndReason;
use App\Domain\StepId;
use App\Domain\UserHandle;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

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
     * Read from `furthest_step_id`, which is a plain column the reducer keeps
     * as a high-water mark. It used to be read from `step_id`, as
     * `step_id ?? the last step` — and ending a session sets `step_id` to
     * null, so every ended session counted as having reached step 6. A safety
     * stop at step 1 reported 100% reach at all six steps on a screen whose
     * next number, taken from the journal, said 0% reached the last one.
     *
     * Grouped rather than hydrated. No session row is built, so nothing is
     * decrypted: this is the console, and the one place staff read somebody's
     * words is the queue. `DB::table` and not the model, so there is no cast
     * in the way and no hydration to be tempted by later.
     *
     * @return list<int>
     */
    private function stepReach(Carbon $since, int $sessions): array
    {
        if ($sessions === 0) {
            return array_fill(0, StepId::count(), 0);
        }

        /** @var array<string, int> $counts */
        $counts = DB::table('guided_sessions')
            ->where('started_at', '>=', $since)
            ->groupBy('furthest_step_id')
            ->selectRaw('furthest_step_id, count(*) as n')
            ->pluck('n', 'furthest_step_id')
            ->all();

        $reach = [];
        foreach (StepId::ordered() as $step) {
            $n = 0;
            foreach ($counts as $id => $count) {
                // An unrecognised value counts as nothing rather than as
                // everything: a step name this build does not know is not
                // evidence that a session got to the end.
                $reached = StepId::tryFrom((string) $id);
                if ($reached !== null && $reached->ordinal() >= $step->ordinal()) {
                    $n += (int) $count;
                }
            }
            $reach[] = self::percent($n, $sessions);
        }

        return $reach;
    }

    /**
     * The last few sessions, as rows the console can print.
     *
     * Both reads name their columns. The session's are all plain, and the one
     * that is not — `data` — is not asked for: this used to call `toDomain()`,
     * which reads it, so every load of this screen decrypted every recent
     * session's text for a row that shows a step number and a rating. The
     * journal's six encrypted columns were being fetched for the sake of
     * `calmer_rating`; the cast is lazy so nothing was decrypted there, but
     * reading the ciphertext of somebody's session to find out how they rated
     * it is a habit worth not having.
     *
     * @return list<array<string, mixed>>
     */
    private function recent(): array
    {
        $rows = [];
        $sessions = GuidedSession::query()
            ->select(['id', 'user_id', 'kind', 'furthest_step_id', 'end_reason', 'started_at', 'ended_at'])
            ->orderByDesc('started_at')
            // `started_at` is not unique, so without this the last rows of a
            // busy second come back in whatever order the database likes.
            ->orderByDesc('id')
            ->limit(self::RECENT)
            ->get();

        foreach ($sessions as $session) {
            $rating = JournalEntry::query()
                ->where('guided_session_id', $session->id)
                ->value('calmer_rating');

            $rows[] = [
                'user' => UserHandle::for($session->user_id),
                'kind' => $session->kind->value,
                'minutes' => self::minutes($session),
                // How far it got, 1-based. Not "or 6 once it has ended": a
                // session that stopped at step 1 ended, and did not get to 6.
                'reachedStep' => $session->furthest_step_id->ordinal(),
                'result' => self::result($session, $rating),
            ];
        }

        return $rows;
    }

    private static function result(GuidedSession $session, mixed $rating): string
    {
        // Compared as the enum, not the string: end_reason is cast, so
        // `=== 'safety_stop'` is quietly always false.
        if ($session->end_reason === EndReason::SafetyStop) {
            return 'safety';
        }

        // `value()` returns the column, so the cast does not run on it.
        return $rating instanceof CalmerRating
            ? $rating->value
            : (is_string($rating) && $rating !== '' ? $rating : 'unrated');
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
