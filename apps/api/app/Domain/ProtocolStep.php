<?php

declare(strict_types=1);

namespace App\Domain;

/** A single step of a protocol version. */
final readonly class ProtocolStep
{
    public function __construct(
        public StepId $id,
        public StepPrompts $prompts,
        /** The condition the guide checks to decide the step is done. */
        public ?string $doneWhen = null,
        /** How many turns the guide may take before moving on. */
        public ?int $maxGuideTurns = null,
    ) {}

    /** Whether this step carries every field a session needs to run it. */
    public function isComplete(): bool
    {
        return $this->prompts->main !== null
            && trim($this->prompts->main) !== ''
            && $this->doneWhen !== null
            && trim($this->doneWhen) !== ''
            && $this->maxGuideTurns !== null;
    }

    /** @param array{main?: string|null, backups?: list<string>, doneWhen?: string|null, maxGuideTurns?: int|null} $edit */
    public function withEdit(array $edit): self
    {
        return new self(
            id: $this->id,
            prompts: new StepPrompts(
                main: array_key_exists('main', $edit) ? $edit['main'] : $this->prompts->main,
                backups: $edit['backups'] ?? $this->prompts->backups,
            ),
            doneWhen: array_key_exists('doneWhen', $edit) ? $edit['doneWhen'] : $this->doneWhen,
            maxGuideTurns: array_key_exists('maxGuideTurns', $edit) ? $edit['maxGuideTurns'] : $this->maxGuideTurns,
        );
    }
}
