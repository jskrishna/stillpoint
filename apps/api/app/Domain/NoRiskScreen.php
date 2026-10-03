<?php

declare(strict_types=1);

namespace App\Domain;

/** A screen that finds nothing, for tests that are not about safety. */
final class NoRiskScreen implements RiskScreen
{
    public function assess(string $utterance): RiskAssessment
    {
        return RiskAssessment::none();
    }
}
