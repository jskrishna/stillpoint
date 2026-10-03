<?php

declare(strict_types=1);

namespace App\Domain;

/** Whether a session walked the whole protocol or was a short one. */
enum SessionKind: string
{
    case Full = 'full';
    case Quick = 'quick';
}
