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
        /**
         * True when the caller named a step this session has already moved
         * past, so the answer was not applied to anything.
         *
         * The signal was still screened and recorded. Nothing else was: the
         * answer was to a question that is no longer on the screen, and
         * recording it against the one that is would put the wrong words in
         * the journal.
         */
        public bool $stale = false,
    ) {}

    /**
     * Whether the guide was actually consulted.
     *
     * The three reasons it was not are a safety stop, a spent budget and an
     * answer to a step that had already moved on, and none should be charged
     * for: a stop never reaches the guide, and a refusal is the caller being
     * told to wait or to ask again, not work done for them.
     */
    public function guideConsulted(): bool
    {
        return ! $this->stopped && ! $this->throttled && ! $this->stale;
    }
}
