<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * One version of the protocol: all six steps, plus the safety wording.
 *
 * Prompt copy is content that staff edit, so it is versioned rather than
 * compiled in. Two rules follow and both matter:
 *
 *  - a version cannot go live while any step is missing copy. An unrunnable
 *    protocol reaching a user is experienced as the guide going quiet on them;
 *  - a running session holds the version it started on, so publishing never
 *    changes the questions under someone already part-way through.
 */
final readonly class ProtocolVersion
{
    /** @param array<string, ProtocolStep> $steps keyed by StepId value */
    public function __construct(
        public int $major,
        public int $minor,
        public string $status,
        public array $steps,
        public string $pauseTitle,
        public string $pauseBody,
        public ?\DateTimeImmutable $publishedAt = null,
    ) {}

    public function label(): string
    {
        return "{$this->major}.{$this->minor}";
    }

    public function step(StepId $id): ProtocolStep
    {
        return $this->steps[$id->value];
    }

    /** @return list<ProtocolStep> */
    public function orderedSteps(): array
    {
        return array_map(fn (StepId $id) => $this->step($id), StepId::ordered());
    }

    public function isEditable(): bool
    {
        return $this->status === 'draft';
    }

    /**
     * The baseline draft, carrying only the copy the designs actually specify.
     *
     * A draft, not live, because most steps are still missing their copy —
     * publish() refuses it until the PRD fills them in, which is the point.
     * Do not invent the missing text: a null is an honest gap, a guess silently
     * becomes the product's voice.
     */
    public static function baseline(): self
    {
        $steps = [];
        foreach (StepId::ordered() as $id) {
            $steps[$id->value] = match ($id) {
                StepId::Notice => new ProtocolStep(
                    $id,
                    new StepPrompts('You’re upset, and that’s okay. What happened?'),
                ),
                StepId::Remember => new ProtocolStep(
                    $id,
                    new StepPrompts(
                        'When did you first feel this way as a child? Take your time.',
                        [
                            'That’s okay. Maybe school, or home — a time someone saw you get something wrong?',
                            'Even a small moment counts. Where were you, and who was there?',
                        ],
                    ),
                    'A specific memory, age under 12',
                    4,
                ),
                StepId::Inquire => new ProtocolStep(
                    $id,
                    new StepPrompts('What did you believe about yourself then?'),
                ),
                default => new ProtocolStep($id, new StepPrompts),
            };
        }

        return new self(
            major: 1,
            minor: 0,
            status: 'draft',
            steps: $steps,
            pauseTitle: 'Let’s pause here.',
            pauseBody: 'What you shared sounds very heavy. Please talk to a real person now. You don’t have to handle this alone.',
        );
    }

    /** @param array{main?: string|null, backups?: list<string>, doneWhen?: string|null, maxGuideTurns?: int|null} $edit */
    public function withStepEdit(StepId $id, array $edit): self
    {
        if (! $this->isEditable()) {
            return $this;
        }

        $steps = $this->steps;
        $steps[$id->value] = $this->step($id)->withEdit($edit);

        return new self(
            $this->major, $this->minor, $this->status, $steps,
            $this->pauseTitle, $this->pauseBody, $this->publishedAt,
        );
    }

    public function withSafetyWording(?string $title = null, ?string $body = null): self
    {
        if (! $this->isEditable()) {
            return $this;
        }

        return new self(
            $this->major, $this->minor, $this->status, $this->steps,
            $title ?? $this->pauseTitle, $body ?? $this->pauseBody, $this->publishedAt,
        );
    }

    /**
     * Everything standing between this draft and going live.
     *
     * Checked rather than assumed: a half-written protocol reaching a user is
     * the failure this whole model exists to prevent. Problems come back as
     * data, named by the step at fault, so the admin screen shows them in
     * place — publishing never throws.
     *
     * @return list<array{stepId: ?StepId, reason: string}>
     */
    public function publishProblems(): array
    {
        $problems = [];

        if ($this->status !== 'draft') {
            $problems[] = ['stepId' => null, 'reason' => "Only a draft can be published; this is {$this->status}."];
        }

        foreach (StepId::ordered() as $id) {
            $step = $this->step($id);
            $n = $id->ordinal();

            if ($step->prompts->main === null || trim($step->prompts->main) === '') {
                $problems[] = ['stepId' => $id, 'reason' => "Step {$n} has no main question."];
            }
            if ($step->doneWhen === null || trim($step->doneWhen) === '') {
                $problems[] = ['stepId' => $id, 'reason' => "Step {$n} does not say when it is done."];
            }
            if ($step->maxGuideTurns === null) {
                $problems[] = ['stepId' => $id, 'reason' => "Step {$n} has no turn limit."];
            } elseif ($step->maxGuideTurns < 1) {
                $problems[] = ['stepId' => $id, 'reason' => "Step {$n} allows no guide turns."];
            }
        }

        if (trim($this->pauseTitle) === '' || trim($this->pauseBody) === '') {
            $problems[] = ['stepId' => null, 'reason' => 'The safety pause message is incomplete.'];
        }

        return $problems;
    }

    public function isPublishable(): bool
    {
        return $this->publishProblems() === [];
    }

    /** Whether every step carries the fields a session needs. */
    public function isRunnable(): bool
    {
        foreach ($this->orderedSteps() as $step) {
            if (! $step->isComplete()) {
                return false;
            }
        }

        return true;
    }

    /** Publishes, or returns null when problems remain. Never throws. */
    public function publish(\DateTimeImmutable $at): ?self
    {
        if (! $this->isPublishable()) {
            return null;
        }

        return new self(
            $this->major, $this->minor, 'live', $this->steps,
            $this->pauseTitle, $this->pauseBody, $at,
        );
    }

    /** Opens the next draft, e.g. 1.4 live -> 1.5 draft. */
    public function nextDraft(): self
    {
        return new self(
            $this->major, $this->minor + 1, 'draft', $this->steps,
            $this->pauseTitle, $this->pauseBody, null,
        );
    }
}
