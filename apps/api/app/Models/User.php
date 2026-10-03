<?php

namespace App\Models;

use App\Domain\ConsentItem;
use App\Domain\Role;
use App\Notifications\ResetPassword;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable([
    // `role` is deliberately absent: it is not something a request may set.
    'name', 'email', 'password', 'plan', 'country',
    'guide_voice', 'talk_mode', 'coach_sharing',
    'accepted_consent', 'consented_at',
])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The role a user has before the database supplies its default.
     *
     * The column has a default too, but a default only lands on insert — an
     * in-memory model built but not reloaded carried a null role, and the gate
     * reading it crashed with a 500 rather than denying. Both layers now say
     * the same thing.
     *
     * @var array<string, mixed>
     */
    protected $attributes = ['role' => 'user'];

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
            'role' => Role::class,
        ];
    }

    /**
     * A missing role reads as the least privileged one.
     *
     * Not a fallback for convenience: if the role cannot be determined, the
     * answer to "may this person read the safety queue" is no.
     */
    public function isStaff(): bool
    {
        return ($this->role ?? Role::User)->isStaff();
    }

    public function isCoach(): bool
    {
        return ($this->role ?? Role::User)->isCoach();
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
            ->using(CoachClient::class)
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
            ->using(CoachClient::class)
            ->withPivot(['status', 'since', 'next_call_at'])
            ->withTimestamps();
    }

    /**
     * Sends the reset email.
     *
     * Overridden so the link points at the web app rather than at this API —
     * see {@see ResetPassword}.
     */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPassword($token));
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
