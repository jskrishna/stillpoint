<?php

declare(strict_types=1);

namespace App\Domain;

/** What the guide does with one turn. */
final readonly class GuideReply
{
    /** @param array<string, mixed> $capture */
    public function __construct(
        /** What the guide says next. */
        public string $say,
        /** Whether the step is satisfied and the session should move on. */
        public bool $advance,
        /** What to record, when the guide got something out of the answer. */
        public array $capture = [],
    ) {}
}
