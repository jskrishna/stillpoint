<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * Anything that can screen an utterance for signs the user may be in danger.
 *
 * Bind a real classifier to this interface in the container. The phrase screen
 * is a backstop behind it, never a replacement for it.
 */
interface RiskScreen
{
    public function assess(string $utterance): RiskAssessment;
}
