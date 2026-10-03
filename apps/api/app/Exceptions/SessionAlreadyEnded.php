<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/**
 * A turn arrived for a session that had already ended.
 *
 * Raised from inside the transaction that locks the session row, which is the
 * only place the answer is trustworthy: the controller's own check runs before
 * the lock, so between the two the session can have ended — and the way it most
 * often ends is a safety stop from the request that got there first.
 *
 * The controller turns this into the same 409 its earlier check produces. The
 * client cannot tell which of the two refused it, and does not need to.
 */
final class SessionAlreadyEnded extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('This session has ended.');
    }
}
