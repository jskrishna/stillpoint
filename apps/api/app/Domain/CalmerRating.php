<?php

declare(strict_types=1);

namespace App\Domain;

/** How the user rated their state on the summary screen. */
enum CalmerRating: string
{
    case Yes = 'yes';
    case ALittle = 'a_little';
    case No = 'no';
}
