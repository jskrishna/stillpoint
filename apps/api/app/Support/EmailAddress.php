<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Str;

/**
 * An email address, in the one spelling this product stores and compares.
 *
 * Lowercased and trimmed, in one function, because it was already being done
 * in five places and not done in the two that matter most.
 *
 * **What it was like.** `users.email` was stored exactly as typed, while the
 * password broker, the invitation table, the rate limiter and the erasure sweep
 * all lowercased. On MySQL that disagreement is invisible: the default
 * collation is case-insensitive, so `where email = ?` matches whatever case was
 * asked. On sqlite — the development container and the documented end-to-end
 * stack — `=` is case-sensitive, and the product came apart:
 *
 *  - somebody who registered `Aarav@Example.com` could not sign in as
 *    `aarav@example.com`: 422, "These credentials do not match our records";
 *  - a second account could be registered differing only in case, because
 *    `unique:users,email` is that same comparison;
 *  - and asking to reset the password **with the exact address they had
 *    registered** answered 200 and sent nothing at all — no notification, no
 *    token row — because the broker lowercases. The 200 is deliberate, so that
 *    an unauthenticated caller cannot learn who has an account, which means the
 *    person is told a link is on its way to an account they can never recover.
 *
 * All three measured, not reasoned about.
 *
 * So the rule is the application's rather than the storage engine's, which is
 * this repository's position everywhere else — the domain owns the rules and a
 * database is where rows go. Relying on a collation means the product behaves
 * one way where it is developed and another way where it runs, and the
 * difference is somebody locked out of their journal.
 *
 * It is **not** `mb_strtolower` on the whole address only by accident: the
 * local part of an address is case-sensitive by RFC 5321 and case-insensitive
 * at every provider anybody uses, and treating two spellings as two accounts
 * in a product about being upset is the worse of the two errors. That is a
 * product decision and it is this one; `DECISIONS.md` is where it would go if
 * it is ever revisited.
 */
final class EmailAddress
{
    /** The stored and compared form. */
    public static function normalise(?string $address): string
    {
        return Str::lower(trim((string) $address));
    }
}
