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
        'feelings',
        'belief',
        'calmer_rating',
        'reached_final_step',
        'occurred_at',
    ];

    public function forUser(User $user, int $windowDays = Insights::DEFAULT_WINDOW_DAYS, ?Carbon $now = null): Insights
    {
        $now ??= Carbon::now();

        $rows = JournalEntry::query()
            ->select(self::COLUMNS)
            ->where('user_id', $user->id)
            ->whereBetween('occurred_at', [$now->copy()->subDays($windowDays), $now])
            ->get();

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
        return Insights::from(array_values($entries), $now, $windowDays);
    }
}
