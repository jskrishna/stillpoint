<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * What a plan allows.
 *
 * The pricing page states it: Free gets "3 full sessions a week" and
 * "Unlimited quick sessions". That is a rule about whether a session may start,
 * so it is domain and lives here — the *prices* are presentation and live in
 * the surface, where `[PRICE]/mo` stays a placeholder until the PRD supplies
 * the figures.
 *
 * The port of `packages/protocol/src/plans.ts`; the parity fixture covers it.
 *
 * ## What is deliberately not here
 *
 * The Coach plan says "Up to 25 clients". What a coach on some *other* plan is
 * allowed is not stated anywhere, so nothing enforces a client cap: a limit
 * applied to people the designs never mentioned would be a product decision
 * made by a guess.
 *
 * And a quick session runs the same six steps as a full one, because nothing
 * says otherwise. The designs show quick sessions as shorter in practice and
 * label them in the journal, but they do not say which steps are skipped.
 */
enum Plan: string
{
    case Free = 'free';
    case Plus = 'plus';
    case Coach = 'coach';

    /** The window the allowance is counted over. */
    public const ALLOWANCE_WINDOW_DAYS = 7;

    /** Full sessions this plan allows per week, or null for unlimited. */
    public function fullSessionsPerWeek(): ?int
    {
        return match ($this) {
            self::Free => 3,
            self::Plus, self::Coach => null,
        };
    }

    /** A stored string, or Free when it is not a plan we know. */
    public static function fromStored(?string $value): self
    {
        return self::tryFrom($value ?? '') ?? self::Free;
    }

    /**
     * Whether a session of this kind may start.
     *
     * A quick session is **always** allowed. That is the point of the rule
     * rather than an exception to it: the limit exists to price the long
     * session, and someone who is upset should never be told to come back next
     * week.
     *
     * @return array{allowed: bool, reason?: string, limit?: int}
     */
    public function mayStart(SessionKind $kind, int $fullSessionsInWindow): array
    {
        if ($kind === SessionKind::Quick) {
            return ['allowed' => true];
        }

        $limit = $this->fullSessionsPerWeek();
        if ($limit === null || $fullSessionsInWindow < $limit) {
            return ['allowed' => true];
        }

        return [
            'allowed' => false,
            'reason' => "Your plan includes {$limit} full sessions a week, and you have used {$fullSessionsInWindow}. A quick session is always available, or upgrade for unlimited full ones.",
            'limit' => $limit,
        ];
    }

    /** How many full sessions are left, or null when unlimited. */
    public function fullSessionsLeft(int $fullSessionsInWindow): ?int
    {
        $limit = $this->fullSessionsPerWeek();

        return $limit === null ? null : max(0, $limit - $fullSessionsInWindow);
    }
}
