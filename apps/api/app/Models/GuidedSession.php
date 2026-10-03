<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\EndReason;
use App\Domain\SafetyLevel;
use App\Domain\Session as DomainSession;
use App\Domain\SessionData;
use App\Domain\SessionKind;
use App\Domain\StepId;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A session as stored.
 *
 * The rules live in App\Domain\Session, not here. This model's job is to carry
 * one in and out of the database without opinions of its own: toDomain() and
 * storeDomain() are the only places the two representations meet.
 */
final class GuidedSession extends Model
{
    use HasFactory, HasUlids;

    protected $fillable = [
        'user_id', 'kind', 'step_id', 'furthest_step_id', 'guide_turns_used', 'end_reason',
        'safety_level', 'protocol_version', 'data', 'started_at', 'ended_at',
    ];

    protected function casts(): array
    {
        return [
            // Encrypted: the most personal text the product holds.
            'data' => 'encrypted:array',
            'kind' => SessionKind::class,
            'step_id' => StepId::class,
            'furthest_step_id' => StepId::class,
            'end_reason' => EndReason::class,
            'safety_level' => SafetyLevel::class,
            'unreadable_turns' => 'integer',
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function safetyFlags(): HasMany
    {
        return $this->hasMany(SafetyFlag::class);
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'id', 'guided_session_id');
    }

    /** Rebuilds the domain object this row represents. */
    public function toDomain(): DomainSession
    {
        $data = $this->data ?? [];

        return new DomainSession(
            kind: $this->kind,
            stepId: $this->step_id,
            // Older rows predate the column and may have nothing in it; the
            // step in progress is the best answer for one of those, and the
            // first step is the only thing certainly true for a row that had
            // already ended. See the migration for why it cannot be better.
            furthestStepId: $this->furthest_step_id ?? $this->step_id ?? StepId::Notice,
            guideTurnsUsed: $this->guide_turns_used,
            data: (new SessionData)->merge($data),
            endReason: $this->end_reason,
            safetyLevel: $this->safety_level,
            protocolVersion: $this->protocol_version,
        );
    }

    /** Writes a domain session back onto this row. */
    public function storeDomain(DomainSession $session): self
    {
        $this->kind = $session->kind;
        $this->step_id = $session->stepId;
        $this->furthest_step_id = $session->furthestStepId;
        $this->guide_turns_used = $session->guideTurnsUsed;
        $this->end_reason = $session->endReason;
        $this->safety_level = $session->safetyLevel;
        $this->protocol_version = $session->protocolVersion;
        $this->data = self::encodeData($session->data);

        if ($session->hasEnded() && $this->ended_at === null) {
            $this->ended_at = now();
        }

        return $this;
    }

    /** @return array<string, mixed> */
    private static function encodeData(SessionData $data): array
    {
        return array_filter([
            'whatHappened' => $data->whatHappened,
            'feelings' => array_map(fn ($f) => $f->value, $data->feelings),
            'memory' => $data->memory,
            'belief' => $data->belief,
            'forgiveness' => $data->forgiveness,
            'title' => $data->title,
            'calmerRating' => $data->calmerRating?->value,
        ], fn ($v) => $v !== null && $v !== []);
    }
}
