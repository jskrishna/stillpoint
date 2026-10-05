<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\ClientStatus;
use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * The coach–client pairing.
 *
 * A pivot model rather than bare `withPivot` columns, so `since` and
 * `next_call_at` arrive as dates. Without it they come back as the raw strings
 * the driver hands over, and every caller has to remember to parse them — which
 * one of them will not.
 *
 * `coach_notes` are the coach's own, about a client, and are never shown to the
 * client.
 */
final class CoachClient extends Pivot
{
    protected $table = 'coach_client';

    public $incrementing = true;

    protected function casts(): array
    {
        return [
            'status' => ClientStatus::class,
            'since' => 'datetime',
            'next_call_at' => 'datetime',
            // Free text about a person, written by somebody else. It was
            // stored as typed, the one personal column the cast had not
            // reached. `RotateEncryptionKey::COLUMNS` has it too.
            'coach_notes' => 'encrypted',
        ];
    }
}
