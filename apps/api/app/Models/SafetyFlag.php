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
     * Most severe first, then most recent — the order the queue works in.
     *
     * Ordered in SQL by an explicit severity ranking rather than by the stored
     * string, which would sort alphabetically and put "high" below "low".
     */
    public function scopeByUrgency(Builder $query): Builder
    {
        return $query
            ->orderByRaw("CASE level WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC")
            ->orderByDesc('raised_at');
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
