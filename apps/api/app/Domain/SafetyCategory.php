<?php

declare(strict_types=1);

namespace App\Domain;

/** What kind of concern was detected, as the flag queue categorises them. */
enum SafetyCategory: string
{
    case SelfHarm = 'self_harm';
    case HarmToOthers = 'harm_to_others';
    case Trauma = 'trauma';
    case Medical = 'medical';

    /**
     * The person pressed "Get help". Not something the screen detected, and
     * deliberately not filed under one of the four above: somebody who does
     * not feel safe has not said why, and "Self-harm" beside their row would
     * be a guess a reviewer then reads as a finding.
     */
    case AskedForHelp = 'asked_for_help';

    public function label(): string
    {
        return match ($this) {
            self::SelfHarm => 'Self-harm',
            self::HarmToOthers => 'Harm to others',
            self::Trauma => 'Trauma',
            self::Medical => 'Medical',
            self::AskedForHelp => 'Asked for help',
        };
    }
}
