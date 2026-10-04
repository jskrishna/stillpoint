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
 * GROUP BY. The window keeps the set small enough for that to be fine.
 */
final class InsightsService
{
    public function forUser(User $user, int $windowDays = Insights::DEFAULT_WINDOW_DAYS, ?Carbon $now = null): Insights
    {
        $now ??= Carbon::now();

        $rows = JournalEntry::query()
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
