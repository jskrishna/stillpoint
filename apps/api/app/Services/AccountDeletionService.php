<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\RoleChange;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Erasing an account.
 *
 * This product holds the most personal text a person is likely to type: what
 * upset them, what they believe about themselves, a childhood memory. Being
 * able to take it back has to be reachable by them, not a support request —
 * and it has to actually take everything, not hide it.
 *
 * Most of the removal is the schema's: sessions, journal entries, safety flags,
 * coaching pairings and invitations all cascade from `users`. What is here is
 * the rest, which cascades would get wrong:
 *
 *  - **tokens**, which have no foreign key, so nothing would remove them;
 *  - **the role-change trail**, which must survive the account but must not
 *    keep its address.
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

            // No foreign key, so nothing would take these with it. A live token
            // for a deleted account is the worst kind of leftover.
            $removed['tokens'] = $user->tokens()->count();
            $user->tokens()->delete();

            $user->delete();

            return $removed;
        });
    }

    /** What an erased address reads as in the trail. */
    public const ERASED = 'a deleted account';
}
