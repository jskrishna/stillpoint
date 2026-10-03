<?php

declare(strict_types=1);

namespace App\Domain;

/** Why a session stopped. */
enum EndReason: string
{
    case Completed = 'completed';
    case SafetyStop = 'safety_stop';
    case UserStopped = 'user_stopped';
}
