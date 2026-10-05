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
     * @param  ?StepId  $answering  The step the caller believes it is answering.
     *
     * Both are read **after** the screen and never before it, and for the same
     * reason: a check in front of this method can refuse a request before
     * anything has looked at what was said, and the request it would refuse is
     * someone saying they are not safe — and then the helplines never appear.
     * So the screen always runs, the signal is always recorded, and what these
     * two withhold is only what comes after it.
     *
     * The budget is the caller's — a rate limit, a quota, whatever the surface
     * uses to stop one client running the guide flat out. A spent one
     * withholds the guide and nothing else.
     *
     * `$answering` exists because a lost response is not a lost turn. A client
     * that sends an answer, has the reply dropped by a flaky network and sends
     * it again would otherwise have the same words recorded twice — the second
     * time against the next step, whose real answer is then never asked for.
     * On a phone on mobile data that is not an edge case. Null when the caller
     * cannot say, which is treated as not having said rather than as a
     * mismatch: a check that refuses what it cannot understand would refuse a
     * crisis, and this arrives in a request body where anything may arrive.
     */
    public function takeTurn(
        Session $session,
        ProtocolVersion $version,
        string $utterance,
        bool $guideAvailable = true,
        ?StepId $answering = null,
    ): TurnResult {
        if ($session->hasEnded()) {
            return new TurnResult($session, '', false, RiskAssessment::none(), false);
        }

        // The whole utterance, however long. Nothing refuses a turn for its
        // length: the longest thing somebody writes is quite often the one
        // that matters most, and a limit that can refuse it is a limit in
        // front of the screen.
        $assessment = $this->risk->assess($utterance);

        // What may be written down is bounded, and only after the screen has
        // read all of it. See `Utterance` for why the bound is storage and not
        // speech.
        $recorded = Utterance::recordable($utterance);

        $flag = self::flagFor($assessment, $recorded);

        // Record the signal first, whatever it was: a Medium flag must survive
        // even when the turn then proceeds normally.
        $next = $session->withSafetySignal($assessment->level);

        if ($assessment->level->mustStop()) {
            // The guide is never consulted, and nothing is said back: the
            // safety screen takes over the surface from here. Never throttled:
            // a stop is the one reply that must always be given.
            return new TurnResult($next, '', false, $assessment, true, $flag);
        }

        // Screened and recorded, and then no further. Checked before the
        // budget because "that question has moved on" is the more useful
        // answer of the two: waiting and sending it again would not make it
        // apply.
        if ($answering !== null && $answering !== $next->stepId) {
            return new TurnResult($next, '', false, $assessment, false, $flag, stale: true);
        }

        if (! $guideAvailable) {
            // Screened, recorded, and no further. The session does not advance
            // and nothing is said, so the caller can refuse without having
            // lost the signal — which is the whole point of checking the
            // budget here rather than in front of this method.
            return new TurnResult($next, '', false, $assessment, false, $flag, throttled: true);
        }

        $reply = $this->guide->respond($next, $version, $recorded);

        $next = $reply->advance
            ? $next->withStepSatisfied($reply->capture)
            : $next->withGuideTurn();

        // When the step moved on, what the guide says next is the new step's
        // question. The scripted guide answers an advancing turn with nothing
        // — acknowledgement copy is not in the designs and inventing it would
        // be inventing the guide's voice — so without this the guide fell
        // silent for the rest of the session: five steps where the client was
        // handed an empty `say` and showed "this step has no question yet",
        // whether or not the step had copy.
        //
        // Through the guide rather than read off the version, so a model that
        // one day wants to acknowledge the answer *and* ask the next question
        // has one place to do it.
        $say = $reply->advance && $next->stepId !== null
            ? $this->openingLine($next, $version)
            : $reply->say;

        return new TurnResult($next, $say, $reply->advance, $assessment, false, $flag);
    }

    /**
     * Screens words that cannot be a turn, because the session they were said
     * into has already ended.
     *
     * `takeTurn()` answers an ended session with nothing and reads nothing,
     * which is right for the reducer and was the last refusal in front of the
     * screen: the caller got a 409 and the words went unread. An ended session
     * cannot be stopped again, so there is no session to return here. What is
     * left is the assessment and the flag, and the caller does the rest.
     *
     * @return array{RiskAssessment, ?SafetyFlag}
     */
    public function screenOnly(string $utterance): array
    {
        $assessment = $this->risk->assess($utterance);

        return [$assessment, self::flagFor($assessment, Utterance::recordable($utterance))];
    }

    private static function flagFor(RiskAssessment $assessment, string $recorded): ?SafetyFlag
    {
        return $assessment->level->mustFlag() && $assessment->category !== null
            ? new SafetyFlag($assessment->level, $assessment->category, Text::trim($recorded))
            : null;
    }

    /** The guide's opening line for the step a session is on. */
    public function openingLine(Session $session, ProtocolVersion $version): string
    {
        return $this->guide->respond($session, $version, '')->say;
    }
}
