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

    public function label(): string
    {
        return match ($this) {
            self::SelfHarm => 'Self-harm',
            self::HarmToOthers => 'Harm to others',
            self::Trauma => 'Trauma',
            self::Medical => 'Medical',
        };
    }
}
