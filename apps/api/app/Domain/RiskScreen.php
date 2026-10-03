<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * Anything that can screen an utterance for signs the user may be in danger.
 *
 * Bind a real classifier to this interface in the container. The phrase screen
 * is a backstop behind it, never a replacement for it.
 *
 * ## What a classifier does when it cannot answer
 *
 * This is written down here because it is a decision, it has to be taken
 * before a vendor is wired in, and it is the kind that gets taken badly at the
 * end of an afternoon. A classifier is a network call, and network calls fail.
 * There are three things an implementation can do about it, and two of them
 * are wrong:
 *
 *  - **Throw.** The turn becomes a 500, so somebody upset gets an error page
 *    instead of a question — and if what they just typed was a disclosure,
 *    nothing screened it and nothing recorded it.
 *  - **Return `none`.** Worse, because it is quiet: the product stops
 *    screening for as long as the model is unreachable and every screen still
 *    says everything is fine.
 *  - **Fall back to the phrase screen**, which is local, synchronous and
 *    cannot fail. It will miss things a model would catch, and it is still
 *    the most that can be true at that moment.
 *
 * So "a backstop behind it" means the third one, and an implementation that
 * wraps a classifier owes that wrapper. It is deliberately not written yet:
 * there is no classifier, and a decorator around the phrase screen wrapping
 * the phrase screen is machinery for an absent dependency.
 *
 * `RiskAssessment::$unreadable` is **not** the answer here, and the two are
 * easy to confuse. That field says "this was in a script I have no phrases
 * for" — a fact about the text, reported and counted. A model being
 * unreachable is a fact about the deployment, and the user's turn should not
 * be made to carry it.
 */
interface RiskScreen
{
    public function assess(string $utterance): RiskAssessment;
}
