<?php

declare(strict_types=1);

namespace App\Domain;

/** Where a client is in their relationship with a coach. */
enum ClientStatus: string
{
    case Active = 'active';
    case Invited = 'invited';
}
