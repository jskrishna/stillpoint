<?php

declare(strict_types=1);

namespace App\Domain;

/** What a screen concluded about one utterance. */
final readonly class RiskAssessment
{
    public function __construct(
        public SafetyLevel $level,
        /** Null when the level is None. */
        public ?SafetyCategory $category = null,
        /** The phrase that triggered it, for the flag a reviewer reads. */
        public ?string $matched = null,
        /**
         * True when part of the utterance was in a script the screen cannot
         * read.
         *
         * A `None` beside `unreadable: true` means **not read**, rather than
         * read and clear. Those were the same answer until now, and it is the
         * more dangerous of the two to leave unsaid: the screen reported
         * `None` with full confidence about text it had deleted.
         *
         * Deliberately not a risk level. See
         * `packages/protocol/src/risk.ts`, which this is the port of, for why
         * grading it up or flagging every one of them would both be wrong.
         *
         * It describes the text, so `false` is the right answer wherever no
         * utterance was screened at all — a refused turn is not evidence about
         * any language.
         */
        public bool $unreadable = false,
    ) {}

    public static function none(bool $unreadable = false): self
    {
        return new self(SafetyLevel::None, unreadable: $unreadable);
    }
}
