<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * How severe a safety signal is, in the words the admin queue uses.
 *
 * Only High stops a session. Low and Medium are raised for review without
 * interrupting someone who is mid-session and not in danger.
 */
enum SafetyLevel: string
{
    case None = 'none';
    case Low = 'low';
    case Medium = 'medium';
    case High = 'high';

    /** What a caller must do at this level. */
    public function action(): string
    {
        return match ($this) {
            self::None => 'continue',
            self::Low, self::Medium => 'flag',
            self::High => 'stop',
        };
    }

    /** Whether the session must stop immediately. */
    public function mustStop(): bool
    {
        return $this === self::High;
    }

    /** Whether a flag should be raised for staff review. */
    public function mustFlag(): bool
    {
        return $this !== self::None;
    }

    public function rank(): int
    {
        return match ($this) {
            self::None => 0,
            self::Low => 1,
            self::Medium => 2,
            self::High => 3,
        };
    }

    /** The more severe of two levels. A session's level only ever rises. */
    public function atLeast(self $other): self
    {
        return $other->rank() > $this->rank() ? $other : $this;
    }
}
