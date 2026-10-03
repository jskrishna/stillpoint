<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\CalmerRating;
use App\Domain\EndReason;
use App\Domain\FeelingId;
use App\Domain\SessionKind;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One finished session, as the journal lists and the detail screen shows.
 *
 * "Only you can see these." A coach sees an entry only through
 * {@see scopeSharedWithCoach}, never by querying a client's journal directly.
 */
final class JournalEntry extends Model
{
    use HasFactory, HasUlids;

    protected $fillable = [
        'user_id', 'guided_session_id', 'title', 'what_happened', 'belief',
        'forgiveness', 'memory', 'note', 'feelings', 'kind', 'duration_minutes',
        'reached_final_step', 'calmer_rating', 'shared_with_coach', 'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            // Encrypted: the user's own words about what hurt them.
            'title' => 'encrypted',
            'what_happened' => 'encrypted',
            'belief' => 'encrypted',
            'forgiveness' => 'encrypted',
            'memory' => 'encrypted:array',
            'note' => 'encrypted',
            'feelings' => 'array',
            'kind' => SessionKind::class,
            'calmer_rating' => CalmerRating::class,
            'reached_final_step' => 'boolean',
            'shared_with_coach' => 'boolean',
            'occurred_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(GuidedSession::class, 'guided_session_id');
    }

    /**
     * Builds an entry from a finished session.
     *
     * Returns null for a session that is still running, and for one that ended
     * for safety: the user was handed to a helpline, and turning that into a
     * diary entry is the wrong thing to put in front of them later. That rule
     * lives here and in the domain, and nowhere else needs to restate it.
     */
    public static function fromSession(GuidedSession $row, int $durationMinutes): ?self
    {
        $session = $row->toDomain();

        if (! $session->hasEnded() || $session->endReason === EndReason::SafetyStop) {
            return null;
        }

        $data = $session->data;

        return new self([
            'user_id' => $row->user_id,
            'guided_session_id' => $row->id,
            'title' => $data->title ?? 'Session',
            'what_happened' => $data->whatHappened,
            'belief' => $data->belief,
            'forgiveness' => $data->forgiveness,
            'memory' => $data->memory,
            'feelings' => array_map(fn (FeelingId $f) => $f->value, $data->feelings),
            'kind' => $session->kind,
            'duration_minutes' => max(1, $durationMinutes),
            'reached_final_step' => $session->endReason === EndReason::Completed,
            'calmer_rating' => $data->calmerRating,
            'shared_with_coach' => false,
            'occurred_at' => $row->started_at,
        ]);
    }

    /** The summary line the journal list shows under the title and date. */
    public function listSummary(): string
    {
        if ($this->belief !== null && $this->belief !== '') {
            return "“{$this->belief}”";
        }

        return $this->kind === SessionKind::Quick ? 'Quick session' : 'Session';
    }

    /** @return list<FeelingId> */
    public function feelingIds(): array
    {
        return array_values(array_filter(array_map(
            fn (string $v) => FeelingId::tryFrom($v),
            $this->feelings ?? [],
        )));
    }

    /** Only what the client chose to share. The one way a coach reads a journal. */
    public function scopeSharedWithCoach(Builder $query): Builder
    {
        return $query->where('shared_with_coach', true);
    }

    public function scopeNewestFirst(Builder $query): Builder
    {
        return $query->orderByDesc('occurred_at');
    }
}
