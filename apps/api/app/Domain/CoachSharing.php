<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * How a user's journal is offered to their coach.
 *
 * The port of the `CoachSharing` type and the two rules in
 * `packages/protocol/src/coach.ts`; the parity fixture covers both.
 *
 * The settings screen has offered these three choices on both surfaces since
 * the beginning and they were decoration: `users.coach_sharing` was stored,
 * validated and printed back in the profile, and nothing in either language
 * read it. "Share every session" shared nothing — `JournalEntry::fromSession()`
 * wrote `shared_with_coach => false` for everybody — and "Never share" blocked
 * nothing, because the per-entry toggle took any value the owner sent.
 *
 * A promise the server does not keep is the same problem whichever way it
 * points, and this one points both ways at once: somebody who chose to share
 * every session had a coach seeing none of them, and somebody who chose never
 * had a setting that did nothing.
 */
enum CoachSharing: string
{
    case AskEachTime = 'ask_each_time';
    case Never = 'never';
    case Always = 'always';

    /**
     * A stored string, or asking, when it is not a choice we know.
     *
     * Asking is the safe default for the same reason it is the designed one:
     * it shares nothing until the user says so about a particular session.
     */
    public static function fromStored(?string $value): self
    {
        return self::tryFrom($value ?? '') ?? self::AskEachTime;
    }

    /**
     * Whether a session written now is shared with the coach straight away.
     *
     * `$hasCoach` is why this takes an argument. "Share every session" is
     * sharing it *with somebody*, and marking entries shared while nobody is
     * paired would mean accepting a coach later hands them a backlog the user
     * chose this setting before ever seeing one. Nothing to share with,
     * nothing shared.
     */
    public function sharesNewEntry(bool $hasCoach): bool
    {
        return $this === self::Always && $hasCoach;
    }

    /**
     * Whether the owner may turn sharing **on** for one entry.
     *
     * False only for `never`, which is what makes that choice mean something:
     * without it, `never` and `ask_each_time` are one behaviour under two
     * labels. It is a lock the person it protects can unlock by changing the
     * setting, which is the only kind of sharing rule worth having — a rule
     * the sharer cannot inspect or reverse is a promise about somebody else.
     *
     * Turning sharing **off** is always allowed, whatever the setting.
     * Somebody who has just chosen "Never share" is the last person to be told
     * they cannot unshare something.
     *
     * It deliberately does not rewrite entries already shared. Ending a
     * pairing does not unshare them either — `shared_with_coach` is a decision
     * the user made about one session and it stays where they put it — and a
     * setting that silently rewrote the past would be the same surprise in the
     * other direction. `DECISIONS.md` carries the question of whether choosing
     * "Never share" should offer to unshare what is already out there.
     */
    public function mayShareEntry(): bool
    {
        return $this !== self::Never;
    }
}
