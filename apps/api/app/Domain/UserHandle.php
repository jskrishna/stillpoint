<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * The short opaque handle staff screens print instead of a person.
 *
 * The safety queue and the console's recent-session list both need to say
 * "these two rows are the same person" without saying who. A hash of the id
 * does that: stable for a user, not reversible, and short enough to read.
 *
 * It is one function and not two because two would drift, and then one screen's
 * handle would be a different person from the other's.
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

    /**
     * Twelve hex characters, where the designs' example shows four.
     *
     * A deliberate departure, for the same kind of reason the colour tokens
     * depart from the designs over AA contrast: the shown value is wrong for
     * what the thing has to do. Four hex characters is 65,536 handles, and the
     * birthday bound puts a first collision at around 300 users — measured,
     * not estimated: at 1,000 sequential ids four characters already produces
     * five colliding handles, and at 20,000 it produces 2,761.
     *
     * A collision does not leak anything. What it does is **merge two people**
     * on the one screen where that matters most. The queue prints this so a
     * reviewer can see that two flags are the same person; with a collision,
     * two people each in crisis read as one person in crisis twice, and the
     * reviewer's judgement about escalation is built on an identity that is
     * not real. There is no version of that which is a cosmetic bug.
     *
     * Twelve characters is 2.8e14 handles: by n²/2N, about one chance in
     * 55,000 of a single collision anywhere at 100,000 users, and still under
     * 0.2% at a million. Eight was tempting and is not enough — at 100,000
     * users it is about a 69% chance of a collision somewhere.
     *
     * If a handle ever has to be short again, the answer is a stored column
     * with a unique index, which makes collisions impossible rather than
     * improbable. That is a migration and a backfill; this is a constant, and
     * nothing stores a handle, so changing it costs a redeploy and no data.
     */
    private const LENGTH = 12;

    public static function for(int $userId): string
    {
        return 'u_'.substr(hash('sha256', self::SALT.$userId), 0, self::LENGTH);
    }
}
