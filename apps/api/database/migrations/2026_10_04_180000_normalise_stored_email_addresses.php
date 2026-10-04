<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One spelling for a stored address.
 *
 * `users.email` was written exactly as typed while five other places compared
 * it lowercased. On MySQL the default collation hid that; on sqlite it meant
 * somebody who registered with a capital could not sign in, could not reset
 * their password, and could have a second account created differing only in
 * case. `App\Support\EmailAddress` is the rule now, and this brings the rows
 * that were written before it into line.
 *
 * **It cannot collide, and that guard is the interesting part.** Lowercasing
 * blind would be fine on MySQL, where `users.email` is unique under a
 * case-insensitive collation so two spellings of one address were never
 * storable. On sqlite they were — which is the bug this closes — so a
 * development database can hold both, and `UPDATE users SET email =
 * LOWER(email)` would then violate the unique index and fail the migration.
 *
 * So it lowercases only where no row already holds the lowercased form, and
 * leaves any collision exactly as it is. That is the same choice
 * `stillpoint:rotate-key` makes for a row it cannot decrypt: leave it rather
 * than guess, because merging two accounts is not a migration's decision —
 * each has its own journal, and which one is "the" account is a question for
 * a person. Nothing has run against real traffic, so in practice this is
 * about development databases; the guard is there so it cannot be the thing
 * that breaks a deployment later.
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('users')->select('id', 'email')->get();
        $lowered = [];

        foreach ($rows as $row) {
            $lowered[mb_strtolower(trim((string) $row->email))][] = $row;
        }

        foreach ($lowered as $address => $group) {
            // More than one row shares this address once case is ignored.
            // Leave all of them: see the note above.
            if (count($group) > 1) {
                continue;
            }

            $row = $group[0];
            if ((string) $row->email !== $address) {
                DB::table('users')->where('id', $row->id)->update(['email' => $address]);
            }
        }
    }

    /**
     * Irreversible, and honestly so: the original case is not recorded
     * anywhere, so there is nothing to put back. Down is a no-op rather than a
     * guess, which also means `migrate:fresh --seed` and CI's up-and-down run
     * both work.
     */
    public function down(): void {}
};
