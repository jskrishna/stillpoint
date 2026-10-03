<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * A coach's invitation to a client.
 *
 * The token is the invitation: holding one is what lets someone accept. So it
 * is generated here rather than by a caller, it is long, and an invite that has
 * been used or revoked cannot be used again.
 */
final class CoachInvite extends Model
{
    use HasFactory, HasUlids;

    /** How long an invite is good for. */
    public const VALID_FOR_DAYS = 14;

    protected $fillable = ['coach_id', 'email', 'token', 'status', 'expires_at', 'accepted_at', 'accepted_by'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
        ];
    }

    /**
     * Opens an invite from a coach to an address.
     *
     * The address is lower-cased because that is how it will be matched when
     * someone accepts, and "Asha@example.com" is the same inbox as
     * "asha@example.com".
     */
    public static function open(User $coach, string $email): self
    {
        return self::create([
            'coach_id' => $coach->id,
            'email' => Str::lower(trim($email)),
            'token' => Str::random(64),
            'status' => 'pending',
            'expires_at' => now()->addDays(self::VALID_FOR_DAYS),
        ]);
    }

    public function coach(): BelongsTo
    {
        return $this->belongsTo(User::class, 'coach_id');
    }

    /** Pending and not yet expired — the only state an invite may be used in. */
    public function isUsable(): bool
    {
        return $this->status === 'pending' && $this->expires_at->isFuture();
    }

    /** Why it cannot be used, for the screen that has to say so. */
    public function unusableReason(): ?string
    {
        return match (true) {
            $this->status === 'accepted' => 'This invitation has already been accepted.',
            $this->status === 'revoked' => 'This invitation was withdrawn.',
            $this->expires_at->isPast() => 'This invitation has expired. Ask your coach for a new one.',
            default => null,
        };
    }

    public function scopeUsable(Builder $query): Builder
    {
        return $query->where('status', 'pending')->where('expires_at', '>', now());
    }
}
