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

    public function takeTurn(Session $session, ProtocolVersion $version, string $utterance): TurnResult
    {
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
            // safety screen takes over the surface from here.
            return new TurnResult($next, '', false, $assessment, true, $flag);
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
