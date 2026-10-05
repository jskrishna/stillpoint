<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Role;
use App\Exceptions\LastAdminCannotLeave;
use App\Models\CoachInvite;
use App\Models\PlanChange;
use App\Models\RoleChange;
use App\Models\User;
use App\Support\EmailAddress;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;

/**
 * Erasing an account.
 *
 * This product holds the most personal text a person is likely to type: what
 * upset them, what they believe about themselves, a childhood memory. Being
 * able to take it back has to be reachable by them, not a support request —
 * and it has to actually take everything, not hide it.
 *
 * Most of the removal is the schema's: sessions, journal entries, safety flags
 * and coaching pairings cascade from `users`. What is here is the rest, and
 * every item on it is something a foreign key does not cover — which is the
 * pattern to look for when a table is added:
 *
 *  - **tokens**, which have no foreign key, so nothing would remove them;
 *  - **the role-change trail**, which must survive the account but must not
 *    keep its address;
 *  - **invitations sent _to_ this address**, which are keyed by the address
 *    rather than by a user — the invitee may have had no account when the
 *    coach sent it. Only the ones a coach _sent_ cascade. This file used to
 *    claim invitations cascaded, and the row with the erased person's email on
 *    it stayed, on their coach's screen;
 *  - **a pending password reset**, whose table is keyed by the address and has
 *    no foreign key either — a live reset token for an account that no longer
 *    exists;
 *  - **web session rows**, which carry `user_id`, an IP and a user-agent, and
 *    whose `user_id` is a plain indexed column with no `constrained()`.
 *
 * It returns what it removed, so the caller can tell the user rather than
 * asserting that something happened.
 */
final readonly class AccountDeletionService
{
    /**
     * Erases an account and everything it owns.
     *
     * @return array<string, int> what was removed, by kind
     */
    public function erase(User $user): array
    {
        return DB::transaction(function () use ($user): array {
            // The last admin cannot be demoted, and for the same reason
            // cannot erase themselves: either way the product is left with
            // nobody who can administer it or read the safety queue, and
            // getting one back takes a shell on the database. The role route
            // had this guard and this route did not, so the one account the
            // rule protects could remove itself with its own password.
            //
            // Counted under the lock the role route takes, on the set of
            // admins in id order, so a demotion and an erasure arriving
            // together cannot each see two admins.
            if (($user->role ?? Role::User) === Role::Admin) {
                $admins = User::query()
                    ->where('role', Role::Admin->value)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->pluck('id');

                if ($admins->count() <= 1) {
                    throw new LastAdminCannotLeave;
                }
            }

            $removed = [
                'sessions' => $user->sessions()->count(),
                'journalEntries' => $user->journalEntries()->count(),
                'coaches' => $user->coaches()->count(),
                'clients' => $user->clients()->count(),
            ];

            // The trail is a record of an administrative action, not of the
            // person. It outlives the account, with the address taken out: what
            // survives is "an account that no longer exists was made an admin,
            // by this person, on this date".
            RoleChange::query()
                ->where('user_id', $user->id)
                ->update(['user_email' => self::ERASED]);
            RoleChange::query()
                ->where('changed_by', $user->id)
                ->update(['changed_by_email' => self::ERASED]);

            // The plan trail is the same kind of record and gets the same
            // treatment. It has no foreign key either, so nothing would reach
            // it: this is the sweep the pattern asks for whenever a table is
            // added, and the table was added after this list was written.
            PlanChange::query()
                ->where('user_id', $user->id)
                ->update(['user_email' => self::ERASED]);
            PlanChange::query()
                ->where('changed_by', $user->id)
                ->update(['changed_by_email' => self::ERASED]);

            // No foreign key, so nothing would take these with it. A live token
            // for a deleted account is the worst kind of leftover.
            $removed['tokens'] = $user->tokens()->count();
            $user->tokens()->delete();

            // Invitations addressed to them. `coach_invites.email` is a string
            // and not a key, deliberately — a coach can invite an address that
            // has no account — so nothing here cascades. Compared lowercased
            // because `CoachInvite::open()` stores it that way and sqlite's `=`
            // is case-sensitive where MySQL's collation is not.
            $address = EmailAddress::normalise($user->email);
            // Grouped. The two conditions are an `or`, and today there is
            // nothing else in the query — but `A and B or C` groups as
            // `(A and B) or C`, so adding one `where` above these later would
            // silently widen the delete to every invitation anybody accepted.
            // That is the "a forgotten `where` is silent" problem with the sign
            // flipped, and it costs a closure to make impossible.
            $invites = CoachInvite::query()->where(
                fn ($q) => $q
                    ->whereRaw('LOWER(email) = ?', [$address])
                    ->orWhere('accepted_by', $user->id)
            );
            $removed['invites'] = $invites->count();
            $invites->delete();

            // A pending reset, through the broker rather than by hand, so the
            // row is found by whatever key the broker writes.
            Password::broker()->deleteToken($user);

            // Nothing signs in through the web guard today — auth is bearer
            // tokens — so this is empty, and it is here for when it is not.
            // Sanctum's cookie mode is the documented right answer for the web
            // client, and the day it lands these rows carry a user id, an IP
            // and a user-agent. `user_id` is an indexed column with no
            // `constrained()`, so no cascade would take them.
            $removed['webSessions'] = DB::table('sessions')->where('user_id', $user->id)->delete();

            $user->delete();

            return $removed;
        });
    }

    /** What an erased address reads as in the trail. */
    public const ERASED = 'a deleted account';
}
