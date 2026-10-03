<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * The session state machine.
 *
 * Immutable: every transition returns a new Session. Three rules hold here and
 * are not preferences — the marketing site promises the first of them publicly:
 *
 *  - a High safety signal ends the session (EndReason::SafetyStop);
 *  - an ended session is terminal, and only the summary rating may still land,
 *    so a late utterance cannot reopen one that stopped for safety;
 *  - the safety level only ever rises.
 *
 * Never weaken these to make a flow more convenient, and never add a resume
 * path around a safety stop.
 */
final readonly class Session
{
    public function __construct(
        public SessionKind $kind,
        public ?StepId $stepId,
        public int $guideTurnsUsed,
        public SessionData $data,
        public ?EndReason $endReason,
        public SafetyLevel $safetyLevel,
        /** The protocol version this session started on, so a publish mid-session changes nothing. */
        public ?string $protocolVersion = null,
    ) {}

    public static function start(
        SessionKind $kind = SessionKind::Full,
        ?string $protocolVersion = null,
    ): self {
        return new self(
            kind: $kind,
            stepId: StepId::Notice,
            guideTurnsUsed: 0,
            data: new SessionData,
            endReason: null,
            safetyLevel: SafetyLevel::None,
            protocolVersion: $protocolVersion,
        );
    }

    public function hasEnded(): bool
    {
        return $this->endReason !== null;
    }

    /** 1-based position of the current step, or null once ended. */
    public function ordinal(): ?int
    {
        return $this->stepId?->ordinal();
    }

    /** The guide spoke: a prompt or a fallback. */
    public function withGuideTurn(): self
    {
        if ($this->hasEnded()) {
            return $this;
        }

        return $this->with(guideTurnsUsed: $this->guideTurnsUsed + 1);
    }

    /**
     * The step is satisfied; move on, or finish if this was the last.
     *
     * @param  array<string, mixed>  $capture
     */
    public function withStepSatisfied(array $capture = []): self
    {
        if ($this->hasEnded() || $this->stepId === null) {
            return $this;
        }

        $data = $this->data->merge($capture);
        $next = $this->stepId->next();

        if ($next === null) {
            return $this->with(stepId: null, data: $data, endReason: EndReason::Completed);
        }

        return $this->with(stepId: $next, guideTurnsUsed: 0, data: $data);
    }

    /**
     * Records a safety signal, ending the session when it is High.
     *
     * The level only rises: a later None never lowers what was already seen.
     */
    public function withSafetySignal(SafetyLevel $level): self
    {
        if ($this->hasEnded()) {
            return $this;
        }

        $raised = $this->with(safetyLevel: $this->safetyLevel->atLeast($level));

        return $level->mustStop()
            ? $raised->with(stepId: null, endReason: EndReason::SafetyStop)
            : $raised;
    }

    public function withUserStopped(): self
    {
        if ($this->hasEnded()) {
            return $this;
        }

        return $this->with(stepId: null, endReason: EndReason::UserStopped);
    }

    /**
     * The summary rating.
     *
     * The one event an ended session still accepts: the summary screen asks for
     * it after the session is over, including after a safety stop, and
     * recording it does not reopen anything.
     */
    public function withRating(CalmerRating $rating): self
    {
        return $this->with(data: $this->data->withRating($rating));
    }

    /**
     * Whether the guide has used up its turns on the current step.
     *
     * False when the step sets no limit: an unstated limit is not a limit of
     * zero.
     */
    public function isOutOfGuideTurns(ProtocolVersion $version): bool
    {
        if ($this->stepId === null) {
            return false;
        }
        $max = $version->step($this->stepId)->maxGuideTurns;

        return $max !== null && $this->guideTurnsUsed >= $max;
    }

    /** @param array<string, mixed> $capture */
    private function with(
        ?SessionKind $kind = null,
        ?StepId $stepId = null,
        ?int $guideTurnsUsed = null,
        ?SessionData $data = null,
        ?EndReason $endReason = null,
        ?SafetyLevel $safetyLevel = null,
        bool $clearStep = false,
    ): self {
        return new self(
            kind: $kind ?? $this->kind,
            // An explicit null stepId means "ended", so it is passed through
            // whenever an endReason is being set.
            stepId: $endReason !== null ? $stepId : ($stepId ?? $this->stepId),
            guideTurnsUsed: $guideTurnsUsed ?? $this->guideTurnsUsed,
            data: $data ?? $this->data,
            endReason: $endReason ?? $this->endReason,
            safetyLevel: $safetyLevel ?? $this->safetyLevel,
            protocolVersion: $this->protocolVersion,
        );
    }
}
