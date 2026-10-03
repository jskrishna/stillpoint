<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/** A stored protocol version. The rules live in App\Domain\ProtocolVersion. */
final class ProtocolVersion extends Model
{
    use HasFactory;

    protected $fillable = [
        'major', 'minor', 'status', 'steps', 'pause_title', 'pause_body', 'published_at',
    ];

    protected function casts(): array
    {
        return [
            'steps' => 'array',
            'published_at' => 'datetime',
        ];
    }
}
