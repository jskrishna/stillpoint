<?php

namespace App\Models;

use App\Domain\ClientStatus;
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
    // `role` and `plan` are deliberately absent: neither is something a
    // request may set. `role` never was. `plan` was fillable while nothing
    // could set it at all — no route accepted one, so it was unreachable
    // rather than guarded — and now that the console grants plans, the one
    // place that writes it assigns it directly, like the role route does.
    'name', 'email', 'password', 'country',
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
     * **Active pairings only**, and that belongs on the relation rather than on
     * each caller. `CoachController::authorizePairing()` asks whether the row
     * exists; a pairing in any other state would answer yes, and a coach would
     * read somebody's shared sessions on the strength of a status nobody
     * checked. Nothing writes a non-active pairing today — `ClientStatus` has
     * `Invited` and an invitation is actually modelled by `coach_invites` — so
     * this guards a door that is not open yet. It is one line here and a silent
     * leak anywhere else.
     *
     * @return BelongsToMany<self, $this>
     */
    public function clients(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'coach_client', 'coach_id', 'client_id')
            ->using(CoachClient::class)
            ->withPivot(['status', 'since', 'next_call_at', 'coach_notes'])
            ->wherePivot('status', ClientStatus::Active->value)
            ->withTimestamps();
    }

    /**
     * Coaches this user has shared with.
     *
     * Active only, for the same reason and with a second one: this is what
     * `/me/coaches` shows, and it must answer "who can read my sessions". A
     * pairing that cannot read is not an answer to that question, and listing
     * one would suggest access that does not exist.
     *
     * @return BelongsToMany<self, $this>
     */
    public function coaches(): BelongsToMany
    {
        return $this->belongsToMany(self::class, 'coach_client', 'client_id', 'coach_id')
            ->using(CoachClient::class)
            ->withPivot(['status', 'since', 'next_call_at'])
            ->wherePivot('status', ClientStatus::Active->value)
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
     *
     * **And nothing reads it.** It is validated by the consent route and stored
     * in `accepted_consent`, and no code in either language asks whether it was
     * accepted — nothing uses anybody's sessions to improve the app. The
     * control fails safe, since declining and accepting are treated the same
     * way, but what the people who ticked it agreed to is decided by whatever
     * first reads this column. See `packages/protocol/src/onboarding.ts` and
     * `DECISIONS.md`.
     */
    public function hasRequiredConsent(): bool
    {
        return ConsentItem::missing($this->accepted_consent ?? []) === [];
    }
}
