<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * Where a client is in their relationship with a coach.
 *
 * One case, and that is the point: **a pivot row means an accepted pairing.**
 *
 * There used to be an `Invited` case as well, from before invitations had a
 * table of their own. Nothing wrote it, and what it would have meant is a
 * pairing the client never agreed to — which a coach could then read shared
 * journal entries through, because sharing is a property of the entry and not
 * of the pairing. "The client creates the pairing, by accepting" cannot be true
 * while a row can exist that says otherwise.
 *
 * An invitation that has not been accepted is a `coach_invites` row. If
 * "invited clients" ever needs to appear in the coach's list, it reads from
 * there.
 */
enum ClientStatus: string
{
    case Active = 'active';
}
