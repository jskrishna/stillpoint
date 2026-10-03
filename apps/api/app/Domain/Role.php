<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * What a user is allowed to be.
 *
 * Three roles, no permission matrix: this product has exactly three kinds of
 * person in it and inventing a general scheme for them would be more code with
 * more ways to be wrong.
 *
 * A coach is not an admin. A coach reads the sessions a client chose to share;
 * an admin reads the safety queue, which contains the user's own words at the
 * moment they said they were not safe. Those are not the same trust.
 */
enum Role: string
{
    case User = 'user';
    case Coach = 'coach';
    case Admin = 'admin';

    /** May read and review the safety queue, and edit the protocol. */
    public function isStaff(): bool
    {
        return $this === self::Admin;
    }

    /** May read the clients who shared with them. */
    public function isCoach(): bool
    {
        return $this === self::Coach;
    }
}
