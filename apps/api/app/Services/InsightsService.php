<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Insights;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Insights for a user, over a window.
 *
 * The rows are loaded and reduced in PHP rather than aggregated in SQL: the
 * beliefs and feelings this reads are encrypted at rest, so there is nothing to
 * GROUP BY.
 *
 * **It names its columns**, which is `CoachAttention`'s rule and was a habit
 * rather than a rule until this read was measured. "The window keeps the set
 * small enough" was the sentence here, and the window bounds the number of
 * days rather than the number of sessions — a quick session is always allowed,
 * by design, so the number of journal rows inside 30 days has no ceiling.
 *
 * Measured, 2,000 entries with a full session's text in each: **55.5 MB** of
 * ciphertext fetched for a screen that reads **494 KB** of it, peaking at
 * 166 MB of process memory. At 4,000 it exhausts `deploy/php.ini`'s own
 * `memory_limit=256M` and the request dies inside Laravel's `Connection`,
 * fetching — before anything is reduced. The person it happens to is the one
 * who used the product most, and what they get is a 500.
 *
 * Six columns were being pulled and two read. `what_happened`, `forgiveness`,
 * `memory`, `note` and `title` are the user's own words about what hurt them,
 * and this screen counts feelings; the encrypted cast is lazy so they were
 * never decrypted, which is exactly the difference between a rule and a habit.
 * `InsightsReadsOnlyWhatItNeedsTest` asserts it on the SQL, because there is
 * nothing in the response to see it by — the version that fetched everything
 * printed identical numbers.
 */
final class InsightsService
{
    /**
     * Exactly what the reduction below reads, and nothing else.
     *
     * `belief` is the only encrypted one, and it is the only encrypted column
     * this screen is about. Adding a field to `Insights` means adding its
     * column here; the test that pins this list is what says so.
     */
    private const COLUMNS = [
        'id',
        'feelings',
        'belief',
        'calmer_rating',
        'reached_final_step',
        'occurred_at',
    ];

    /**
     * The most entries this will read, and where the number comes from.
     *
     * Naming the columns moved the ceiling about five times and did not make
     * this bounded — the window bounds days, not sessions, and a quick session
     * is always allowed. Measured on a seeded account, peak process memory
     * against `deploy/php.ini`'s `memory_limit=256M`, which is ~24 MB of
     * bootstrap before this runs:
     *
     *   2,000 rows → 34 MB      10,000 rows → 76 MB
     *   5,000 rows → 50 MB      20,000 rows → 130 MB
     *   45,000 rows → 262 MB, which does not fit: the request dies inside
     *   `Illuminate\Collections\Collection`, fetching, before anything is
     *   reduced. About 5.3 MB per thousand entries, so the limit is reached at
     *   roughly **44,000 entries inside the window**.
     *
     * So the failure was never going to reach a person: 44,000 entries in
     * thirty days is about 1,450 sessions a day. It is a number a script
     * reaches, and the cost falls on that one account's own screen, because
     * the read is per-user. That is why this is a ceiling rather than paging
     * or plaintext counters — the second would trade the encryption for a
     * query, which this file's own rule refuses.
     *
     * 5,000 is picked so that the ceiling is real and the caveat is
     * unreachable. A heavy user at ten sessions a day for thirty days has 300
     * entries, so there is about sixteen times that in headroom, and the peak
     * stays near 50 MB. Nobody who is actually using the product sees a
     * partial number; what changes is that the server's work per request is
     * now bounded rather than merely improbable.
     */
    public const MAX_ROWS = 5_000;

    /**
     * `$maxRows` is a test seam, for the reason `$now` is one: the branch
     * where the window is truncated needs five thousand and one journal rows
     * to reach otherwise, and a test that seeds those is a test nobody runs.
     * Nothing in the application passes it.
     */
    public function forUser(
        User $user,
        int $windowDays = Insights::DEFAULT_WINDOW_DAYS,
        ?Carbon $now = null,
        ?int $maxRows = null,
    ): InsightsRead {
        $now ??= Carbon::now();
        $maxRows ??= self::MAX_ROWS;

        // One row more than the ceiling, so truncation is visible without a
        // second `count()` over the same window.
        //
        // Newest first, because the entries worth keeping when there are too
        // many are the recent ones — and `id` after `occurred_at`, for the
        // reason every paged ordering here ends in `id`: `occurred_at` is not
        // unique, and a tie with no tiebreaker makes which rows survive the
        // cut depend on the storage engine.
        $rows = JournalEntry::query()
            ->select(self::COLUMNS)
            ->where('user_id', $user->id)
            ->whereBetween('occurred_at', [$now->copy()->subDays($windowDays), $now])
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->limit($maxRows + 1)
            ->get();

        $partial = $rows->count() > $maxRows;
        if ($partial) {
            $rows = $rows->take($maxRows);
        }

        $entries = $rows->map(fn (JournalEntry $e) => [
            'feelings' => $e->feelingIds(),
            'belief' => $e->belief,
            'calmerRating' => $e->calmer_rating,
            'reachedFinalStep' => (bool) $e->reached_final_step,
            'occurredAt' => $e->occurred_at,
        ])->all();

        // `$now` as well as the SQL window: the domain narrows to the window
        // itself now, so a caller that forgot to scope cannot produce a
        // window that lies. This one scopes anyway, because that is what keeps
        // the set small enough to reduce in PHP.
        return new InsightsRead(Insights::from(array_values($entries), $now, $windowDays), $partial);
    }
}
