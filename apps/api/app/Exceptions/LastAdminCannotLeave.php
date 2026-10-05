<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/** Erasing this account would leave nobody able to read the safety queue. */
final class LastAdminCannotLeave extends RuntimeException
{
    public function __construct()
    {
        parent::__construct(
            'You are the only admin. Make somebody else an admin first, so the safety queue still has a reader.',
        );
    }
}
