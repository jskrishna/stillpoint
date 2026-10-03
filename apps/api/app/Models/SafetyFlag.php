<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\SafetyCategory;
use App\Domain\SafetyLevel;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One entry in the safety queue. */
final class SafetyFlag extends Model
{
    use HasFactory, HasUlids;

    protected $fillable = [
        'user_id', 'guided_session_id', 'level', 'category', 'excerpt',
        'outcome', 'status', 'raised_at', 'reviewed_at', 'reviewed_by',
    ];

    /**
     * Keeps `severity` in step with `level`.
     *
     * The rank is the domain's (`SafetyLevel::rank()`); the column exists so
     * the database can order by it, and writing it here rather than asking
     * every caller to is the only way it stays true.
     */
    protected static function booted(): void
    {
        self::saving(function (self $flag): void {
            $flag->severity = $flag->level?->rank() ?? 0;
        });
    }

    protected function casts(): array
    {
        return [
            // The most sensitive column in the schema.
            'excerpt' => 'encrypted',
            'level' => SafetyLevel::class,
            'category' => SafetyCategory::class,
            'raised_at' => 'datetime',
            'reviewed_at' => 'datetime',
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

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', 'open');
    }

    /**
     * Most severe first, then most recent, then by id — the order the queue
     * works in.
     *
     * Three real columns, not a `CASE` expression. The expression sorted
     * correctly but could not be paged: a cursor is built from the ordering
     * columns, and two pages of the queue overlapped. `id` is last as the
     * tiebreaker, because two flags raised in the same second would otherwise
     * have no settled order and a cursor needs one.
     */
    public function scopeByUrgency(Builder $query): Builder
    {
        return $query
            ->orderByDesc('severity')
            ->orderByDesc('raised_at')
            ->orderByDesc('id');
    }

    public function markReviewed(?User $by = null): self
    {
        if ($this->status === 'reviewed') {
            return $this;
        }

        $this->status = 'reviewed';
        $this->reviewed_at = now();
        $this->reviewed_by = $by?->id;

        return $this;
    }
}
