<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * How much of one answer is kept.
 *
 * The port of `packages/protocol/src/utterance.ts`, which has the reasoning.
 * In short: this is a storage bound, not a limit on what a person may say. It
 * used to be `max:5000` on the turns route, which made it a refusal in front
 * of the safety screen — and a 5,222-character outpouring ending in a
 * disclosure answered 422 without being screened at all.
 *
 * Nothing refuses a turn for its length now. The screen reads every character
 * that arrives; this bounds only what is written down afterwards.
 */
final class Utterance
{
    /** Mirrored by `RECORDED_UTTERANCE_LIMIT`; the parity fixture carries it. */
    public const RECORDED_LIMIT = 20_000;

    /**
     * What may be recorded from an utterance.
     *
     * Called **after** the screen has read the whole thing, never before it.
     *
     * Counts characters rather than bytes, so the limit is the same sentence in
     * Devanagari as in Latin. Bytes would make the same answer three times
     * longer in Hindi, which would be the bound quietly treating one language
     * as more expensive than another.
     */
    public static function recordable(string $utterance): string
    {
        return mb_strlen($utterance) <= self::RECORDED_LIMIT
            ? $utterance
            : mb_substr($utterance, 0, self::RECORDED_LIMIT);
    }
}
