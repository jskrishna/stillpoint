<?php

declare(strict_types=1);

namespace App\Domain;

/** What one turn produced. */
final readonly class TurnResult
{
    public function __construct(
        public Session $session,
        /** What the guide says back. Empty when safety stopped the turn. */
        public string $say,
        public bool $advanced,
        public RiskAssessment $risk,
        /** True when the session ended because of what was just said. */
        public bool $stopped,
        /** Set when a reviewer should see this turn. */
        public ?SafetyFlag $flag = null,
    ) {}
}
