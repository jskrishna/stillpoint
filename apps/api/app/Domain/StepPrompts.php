<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * What the guide says to move a step along.
 *
 * The guide opens with the main question. If the user cannot answer, it falls
 * back through the backups in order.
 */
final readonly class StepPrompts
{
    /** @param list<string> $backups */
    public function __construct(
        /** The step's opening question. Null where the designs do not state it. */
        public ?string $main = null,
        public array $backups = [],
    ) {}
}
