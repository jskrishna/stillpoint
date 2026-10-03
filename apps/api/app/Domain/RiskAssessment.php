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
    ) {}

    public static function none(): self
    {
        return new self(SafetyLevel::None);
    }
}
