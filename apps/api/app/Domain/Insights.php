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
     * Entries that fall inside the window ending at `$now`.
     *
     * Inclusive at both ends, like `withinWindow()` in
     * `packages/protocol/src/insights.ts`.
     *
     * @param  list<array{occurredAt: \DateTimeInterface, ...}>  $entries
     * @return list<array{occurredAt: \DateTimeInterface, ...}>
     */
    public static function withinWindow(
        array $entries,
        \DateTimeInterface $now,
        int $windowDays = self::DEFAULT_WINDOW_DAYS,
    ): array {
        $to = $now->getTimestamp();
        $from = $to - $windowDays * 86400;

        return array_values(array_filter($entries, function (array $entry) use ($from, $to): bool {
            $at = $entry['occurredAt']->getTimestamp();

            return $at >= $from && $at <= $to;
        }));
    }

    /**
     * Summarises the journal over a window.
     *
     * "Felt calmer" counts an explicit yes only. "A little" is left out on
     * purpose: the number is shown back to the user as something they said, so
     * it should not round their hedge up into agreement.
     *
     * **It narrows to the window itself**, which it did not. `insights()` in
     * `packages/protocol/src/insights.ts` always has, so the two had different
     * contracts for the same rule: this one recorded `windowDays` as a label
     * and trusted whoever called it to have scoped the rows. `InsightsService`
     * does, in SQL, so nothing was wrong — but the second caller to forget
     * would have had a window that lied, silently, and the parity fixture
     * could not hold a case with an out-of-window entry while the two
     * disagreed about whose job it was. The SQL `whereBetween` stays: it is
     * what keeps the set small enough to reduce in PHP at all.
     *
     * @param  list<array{feelings: list<FeelingId>, belief: ?string, calmerRating: ?CalmerRating, reachedFinalStep: bool, occurredAt: \DateTimeInterface}>  $entries
     */
    public static function from(
        array $entries,
        \DateTimeInterface $now,
        int $windowDays = self::DEFAULT_WINDOW_DAYS,
    ): self {
        $entries = self::withinWindow($entries, $now, $windowDays);

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
    /**
     * Contractions expanded before punctuation is stripped.
     *
     * Without this, "I'm not good enough" normalised to "im not good enough"
     * and "I am not good enough" to "i am not good enough" — two different
     * beliefs, so the belief that comes back did not come back. It is the most
     * common way an English speaker says the thing this insight exists to find.
     *
     * Kept to contractions people use about themselves. Expanding them is safe
     * in the direction that matters: merging two spellings of one belief, never
     * two different beliefs.
     *
     * @var array<string, string>
     */
    private const CONTRACTIONS = [
        "/\bi'm\b/u" => 'i am',
        "/\bi've\b/u" => 'i have',
        "/\bi'll\b/u" => 'i will',
        "/\bi'd\b/u" => 'i would',
        "/\bcan't\b/u" => 'cannot',
        "/\bwon't\b/u" => 'will not',
        "/\bdon't\b/u" => 'do not',
        "/\bdoesn't\b/u" => 'does not',
        "/\bdidn't\b/u" => 'did not',
        "/\bisn't\b/u" => 'is not',
        "/\baren't\b/u" => 'are not',
        "/\bwasn't\b/u" => 'was not',
        "/\bweren't\b/u" => 'were not',
        "/\bcouldn't\b/u" => 'could not',
        "/\bshouldn't\b/u" => 'should not',
        "/\bwouldn't\b/u" => 'would not',
        "/\bit's\b/u" => 'it is',
        "/\bthat's\b/u" => 'that is',
        "/\bthere's\b/u" => 'there is',
        "/\bthey're\b/u" => 'they are',
        "/\byou're\b/u" => 'you are',
    ];

    /**
     * Compares beliefs ignoring case, surrounding quotes, punctuation, spacing
     * and contractions.
     *
     * The port of `normalizeBelief` in `packages/protocol/src/insights.ts`; the
     * parity fixture covers it.
     */
    private static function normalise(string $belief): string
    {
        // Apostrophes are straightened first, so a curly one hits the same
        // rule, and the contractions expand before punctuation is stripped —
        // afterwards "i'm" is already "im" and there is nothing to recognise.
        $text = mb_strtolower($belief);
        $text = str_replace(['’', '‘', '`'], "'", $text);

        foreach (self::CONTRACTIONS as $pattern => $expansion) {
            $text = preg_replace($pattern, $expansion, $text) ?? $text;
        }

        // The danda and the double danda belong here with the full stop.
        // Without them "मैं काफी नहीं हूँ।" and the same sentence without the
        // danda are two keys, and a belief that did come back does not look
        // like it did.
        $text = preg_replace('/[“”"\'’‘.,!?\x{0964}\x{0965}]/u', '', $text) ?? '';
        $text = preg_replace('/\s+/u', ' ', $text) ?? '';

        return trim($text);
    }
}
