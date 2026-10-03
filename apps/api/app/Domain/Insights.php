<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * What the journal adds up to over a window.
 *
 * Deliberately plain arithmetic, and nothing else. Telling someone who is upset
 * what a model thinks of their pattern is a product decision nobody has taken,
 * so this only counts what they themselves said.
 *
 * It works over entries already loaded rather than in SQL, because the columns
 * it reads are encrypted at rest and cannot be grouped. That is a deliberate
 * trade, not an oversight.
 */
final readonly class Insights
{
    public const DEFAULT_WINDOW_DAYS = 30;

    /**
     * @param  list<array{id: FeelingId, label: string, count: int}>  $feelings
     * @param  array{belief: string, sessions: int}|null  $recurringBelief
     */
    public function __construct(
        public int $windowDays,
        public int $sessions,
        public int $feltCalmer,
        public int $reachedFinalStep,
        public array $feelings,
        public ?array $recurringBelief = null,
    ) {}

    /**
     * Summarises a set of entries.
     *
     * "Felt calmer" counts an explicit yes only. "A little" is left out on
     * purpose: the number is shown back to the user as something they said, so
     * it should not round their hedge up into agreement.
     *
     * @param  list<array{feelings: list<FeelingId>, belief: ?string, calmerRating: ?CalmerRating, reachedFinalStep: bool, occurredAt: \DateTimeInterface}>  $entries
     */
    public static function from(array $entries, int $windowDays = self::DEFAULT_WINDOW_DAYS): self
    {
        $counts = [];
        foreach ($entries as $entry) {
            // One session counts once per feeling, however often it was named.
            foreach (array_unique(array_map(fn (FeelingId $f) => $f->value, $entry['feelings'])) as $value) {
                $counts[$value] = ($counts[$value] ?? 0) + 1;
            }
        }

        $feelings = [];
        foreach ($counts as $value => $count) {
            $id = FeelingId::from($value);
            $feelings[] = ['id' => $id, 'label' => $id->label(), 'count' => $count];
        }
        usort($feelings, fn (array $a, array $b) => $b['count'] <=> $a['count'] ?: strcmp($a['label'], $b['label']));

        return new self(
            windowDays: $windowDays,
            sessions: count($entries),
            feltCalmer: count(array_filter($entries, fn ($e) => $e['calmerRating'] === CalmerRating::Yes)),
            reachedFinalStep: count(array_filter($entries, fn ($e) => $e['reachedFinalStep'])),
            feelings: $feelings,
            recurringBelief: self::recurringBelief($entries),
        );
    }

    /**
     * The belief appearing in the most sessions, or null when none repeats.
     *
     * A belief named once is not a pattern, so the threshold is two. Ties break
     * by whichever was said most recently, and the wording kept is the most
     * recent one — which is how the user puts it now.
     *
     * @param  list<array{belief: ?string, occurredAt: \DateTimeInterface}>  $entries
     * @return array{belief: string, sessions: int}|null
     */
    public static function recurringBelief(array $entries): ?array
    {
        $groups = [];

        foreach ($entries as $entry) {
            $belief = $entry['belief'] ?? null;
            if ($belief === null) {
                continue;
            }

            $key = self::normalise($belief);
            if ($key === '') {
                continue;
            }

            $at = $entry['occurredAt']->getTimestamp();
            $existing = $groups[$key] ?? null;

            $groups[$key] = $existing === null
                ? ['belief' => $belief, 'at' => $at, 'count' => 1]
                : [
                    'belief' => $at >= $existing['at'] ? $belief : $existing['belief'],
                    'at' => max($at, $existing['at']),
                    'count' => $existing['count'] + 1,
                ];
        }

        $best = null;
        foreach ($groups as $group) {
            if ($best === null
                || $group['count'] > $best['count']
                || ($group['count'] === $best['count'] && $group['at'] > $best['at'])) {
                $best = $group;
            }
        }

        if ($best === null || $best['count'] < 2) {
            return null;
        }

        return ['belief' => $best['belief'], 'sessions' => $best['count']];
    }

    /**
     * Compares beliefs ignoring case, quotes, punctuation and spacing, so
     * "I'm not good enough." and "I'm not good enough" count as one.
     */
    private static function normalise(string $belief): string
    {
        $text = mb_strtolower($belief);
        $text = preg_replace('/[“”"\'’‘.,!?]/u', '', $text) ?? '';
        $text = preg_replace('/\s+/u', ' ', $text) ?? '';

        return trim($text);
    }
}
