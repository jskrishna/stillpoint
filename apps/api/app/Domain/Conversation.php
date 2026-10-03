<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * One turn of a session: what happens between a user speaking and the guide
 * answering.
 *
 * **The order here is the point.** Safety is screened before the guide is ever
 * consulted, and a High utterance ends the session without the guide replying
 * at all. A model answering someone who has just said they are not safe is the
 * exact failure this ordering prevents. There is a test asserting the guide is
 * never called; treat a change that breaks it as a bug, not a failing test.
 */
final readonly class Conversation
{
    public function __construct(
        private Guide $guide,
        private RiskScreen $risk,
    ) {}

    /**
     * @param  bool  $guideAvailable  Whether the guide may be consulted at all.
     *
     * The budget is the caller's — a rate limit, a quota, whatever the surface
     * uses to stop one client running the guide flat out. It is an argument
     * rather than something checked before this method because of *where* it
     * has to apply: after the screen and never before it.
     *
     * A limit that can refuse a request before it is screened can refuse
     * someone saying they are not safe, and then the helplines never appear.
     * So the screen always runs, the signal is always recorded, and a spent
     * budget only withholds the guide.
     */
    public function takeTurn(
        Session $session,
        ProtocolVersion $version,
        string $utterance,
        bool $guideAvailable = true,
    ): TurnResult {
        if ($session->hasEnded()) {
            return new TurnResult($session, '', false, RiskAssessment::none(), false);
        }

        $assessment = $this->risk->assess($utterance);

        $flag = $assessment->level->mustFlag() && $assessment->category !== null
            ? new SafetyFlag($assessment->level, $assessment->category, trim($utterance))
            : null;

        // Record the signal first, whatever it was: a Medium flag must survive
        // even when the turn then proceeds normally.
        $next = $session->withSafetySignal($assessment->level);

        if ($assessment->level->mustStop()) {
            // The guide is never consulted, and nothing is said back: the
            // safety screen takes over the surface from here. Never throttled:
            // a stop is the one reply that must always be given.
            return new TurnResult($next, '', false, $assessment, true, $flag);
        }

        if (! $guideAvailable) {
            // Screened, recorded, and no further. The session does not advance
            // and nothing is said, so the caller can refuse without having
            // lost the signal — which is the whole point of checking the
            // budget here rather than in front of this method.
            return new TurnResult($next, '', false, $assessment, false, $flag, throttled: true);
        }

        $reply = $this->guide->respond($next, $version, $utterance);

        $next = $reply->advance
            ? $next->withStepSatisfied($reply->capture)
            : $next->withGuideTurn();

        return new TurnResult($next, $reply->say, $reply->advance, $assessment, false, $flag);
    }

    /** The guide's opening line for the step a session is on. */
    public function openingLine(Session $session, ProtocolVersion $version): string
    {
        return $this->guide->respond($session, $version, '')->say;
    }
}
