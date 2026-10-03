<?php

declare(strict_types=1);

namespace App\Domain;

/** One entry in the safety queue, for staff to review. */
final readonly class SafetyFlag
{
    public function __construct(
        public SafetyLevel $level,
        public SafetyCategory $category,
        /** The user's own words that triggered it. */
        public string $excerpt,
    ) {}
}
