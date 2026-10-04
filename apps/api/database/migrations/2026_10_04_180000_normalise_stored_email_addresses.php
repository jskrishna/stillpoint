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
        // Row by row rather than all of them: this is a migration against a
        // table with no ceiling on it, and `select()->get()` would hold every
        // address in memory at once. That is the same unbounded read the
        // insights query was just fixed for, and writing it here a commit
        // later would be the shape of thing this repository keeps catching.
        //
        // Two passes rather than one, because a collision is only visible
        // once both rows have been seen: the first counts, the second writes.
        //
        // `chunk` rather than `chunkById` is safe here only because the write
        // touches `email` and the order is on `id`, so no row moves into or
        // out of a later page. It would not be safe if this updated the
        // column it paged by.
        // `mb_strtolower(trim(...))` by hand rather than
        // `App\Support\EmailAddress::normalise()`, which is the same thing
        // today. A migration is a historical record of one change to one
        // schema, and it has to keep running years after whatever class it
        // might have called has been renamed, moved or deleted. So it depends
        // on nothing but the query builder — do not "tidy" this into the
        // helper.
        $counts = [];

        DB::table('users')->select('id', 'email')->orderBy('id')->chunk(500, function ($rows) use (&$counts): void {
            foreach ($rows as $row) {
                $address = mb_strtolower(trim((string) $row->email));
                $counts[$address] = ($counts[$address] ?? 0) + 1;
            }
        });

        DB::table('users')->select('id', 'email')->orderBy('id')->chunk(500, function ($rows) use ($counts): void {
            foreach ($rows as $row) {
                $address = mb_strtolower(trim((string) $row->email));

                // More than one row shares this address once case is ignored.
                // Leave all of them: see the note above.
                if (($counts[$address] ?? 0) > 1 || (string) $row->email === $address) {
                    continue;
                }

                DB::table('users')->where('id', $row->id)->update(['email' => $address]);
            }
        });
    }

    /**
     * Irreversible, and honestly so: the original case is not recorded
     * anywhere, so there is nothing to put back. Down is a no-op rather than a
     * guess, which also means `migrate:fresh --seed` and CI's up-and-down run
     * both work.
     */
    public function down(): void {}
};
