<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * A client who needs their coach's attention.
 *
 * A session that ended for safety is never journalled, so it can never be
 * shared: `JournalEntry::fromSession()` returns null for one and the absence of
 * the row is how that is kept. A coach therefore cannot learn of a safety stop
 * by reading, which is correct — and would also mean they never learn of it at
 * all. This is the product telling them instead.
 *
 * It carries **when**, and nothing of what was said. The words are in the
 * safety queue, which is a reviewer's screen; a coach is not a reviewer.
 */
final readonly class CoachAttention
{
    public function __construct(
        public int $clientId,
        public string $reason,
        public \DateTimeImmutable $at,
    ) {}
}
