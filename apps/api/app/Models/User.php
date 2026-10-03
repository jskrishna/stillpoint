<?php

namespace App\Models;

use App\Domain\ConsentItem;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable([
    'name', 'email', 'password', 'plan', 'country',
    'guide_voice', 'talk_mode', 'coach_sharing',
    'accepted_consent', 'consented_at',
])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'accepted_consent' => 'array',
            'consented_at' => 'datetime',
        ];
    }

    /** @return HasMany<GuidedSession, $this> */
    public function sessions(): HasMany
    {
        return $this->hasMany(GuidedSession::class);
    }

    /** @return HasMany<JournalEntry, $this> */
    public function journalEntries(): HasMany
    {
        return $this->hasMany(JournalEntry::class);
    }

    /**
     * Clients this user coaches.
     *
     * @return BelongsToMany<self, $this>
     */
    public function clients(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'coach_client', 'coach_id', 'client_id')
            ->withPivot(['status', 'since', 'next_call_at', 'coach_notes'])
            ->withTimestamps();
    }

    /**
     * Coaches this user has shared with.
     *
     * @return BelongsToMany<self, $this>
     */
    public function coaches(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'coach_client', 'client_id', 'coach_id')
            ->withPivot(['status', 'since', 'next_call_at'])
            ->withTimestamps();
    }

    /**
     * Whether this user has agreed to everything required before a session.
     *
     * The optional "use my anonymous sessions to improve the app" is never part
     * of this: letting an unticked data item block someone would turn a choice
     * into a toll.
     */
    public function hasRequiredConsent(): bool
    {
        return ConsentItem::missing($this->accepted_consent ?? []) === [];
    }
}
