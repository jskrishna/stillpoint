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
        /**
         * True when the guide was not consulted because the caller's budget
         * was spent. The safety signal was still screened and recorded; only
         * the guide was withheld.
         */
        public bool $throttled = false,
    ) {}

    /**
     * Whether the guide was actually consulted.
     *
     * The two reasons it was not are a safety stop and a spent budget, and
     * neither should be charged for: a stop never reaches the guide, and a
     * refusal is the caller being told to wait, not work done for them.
     */
    public function guideConsulted(): bool
    {
        return ! $this->stopped && ! $this->throttled;
    }
}
