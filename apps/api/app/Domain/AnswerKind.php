<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * What kind of answer a step takes.
 *
 * Five steps are answered in the user's own words. Step 3 is not: the designs
 * give it a grid of the twelve feelings and "Choose up to 3", so its answer is
 * a selection of {@see FeelingId} and not prose.
 *
 * This belongs to the step *id*, not to a protocol version: it is the shape of
 * the screen, not copy, and staff editing prompts in the admin console must not
 * be able to turn a selection into a sentence.
 */
enum AnswerKind: string
{
    case Prose = 'prose';
    case Feelings = 'feelings';
}
