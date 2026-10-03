<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * What a coach can see of a client.
 *
 * The coach portal states the rule plainly: "You only see sessions your clients
 * choose to share." So it is enforced here, once, rather than trusted to every
 * query and screen that touches a client's journal.
 *
 * Both functions take a whole journal and share it down themselves, so a caller
 * cannot summarise private entries by passing the wrong list. The port of
 * `packages/protocol/src/coach.ts`; they must agree.
 *
 * @phpstan-type Entry array{sharedWithCoach: bool, occurredAt: \DateTimeImmutable, belief: ?string}
 */
final class CoachView
{
    /**
     * Narrows a journal to what the client has shared.
     *
     * The only way a coach's view should ever be built.
     *
     * @param  list<array<string, mixed>>  $entries
     * @return list<array<string, mixed>>
     */
    public static function sharedWith(array $entries): array
    {
        return array_values(array_filter($entries, fn (array $e) => (bool) ($e['sharedWithCoach'] ?? false)));
    }

    /**
     * Summarises what a coach can see of one client.
     *
     * @param  list<array<string, mixed>>  $entries
     * @return array{sharedCount: int, lastSharedAtMs: ?int, recurringBelief: ?array{belief: string, sessions: int}}
     */
    public static function summarise(array $entries): array
    {
        $shared = self::sharedWith($entries);

        $last = null;
        foreach ($shared as $entry) {
            $at = $entry['occurredAt'] ?? null;
            if ($at instanceof \DateTimeInterface && ($last === null || $at > $last)) {
                $last = $at;
            }
        }

        return [
            'sharedCount' => count($shared),
            // Epoch milliseconds, so the TypeScript port and this one compare
            // as the same instant rather than as two spellings of one.
            'lastSharedAtMs' => $last === null ? null : $last->getTimestamp() * 1000,
            // Computed over the shared set only: a belief that comes back is
            // the coach's most useful signal, and it must not be drawn from
            // sessions the client kept to themselves.
            'recurringBelief' => Insights::recurringBelief($shared),
        ];
    }
}
