<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * The short opaque handle staff screens print instead of a person.
 *
 * The safety queue and the console's recent-session list both need to say
 * "these two rows are the same person" without saying who. A hash of the id
 * does that: stable for a user, not reversible, and short enough to read —
 * "u_8f21", as the designs print it.
 *
 * It is one function and not two because two would drift, and then one screen's
 * "u_8f21" would be a different person from the other's.
 */
final class UserHandle
{
    /**
     * The salt is a constant rather than a secret.
     *
     * A handle is not a security boundary: anyone who can enumerate user ids
     * can rebuild the table. What it is for is keeping a name and an email off
     * a screen that does not need them, and keeping staff from recognising
     * someone they happen to know.
     */
    private const SALT = 'stillpoint-queue-handle:';

    public static function for(int $userId): string
    {
        return 'u_'.substr(hash('sha256', self::SALT.$userId), 0, 4);
    }
}
