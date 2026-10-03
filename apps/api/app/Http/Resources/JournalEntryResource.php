<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\JournalEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @property JournalEntry $resource */
final class JournalEntryResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->id,
            'title' => $this->resource->title,
            'summary' => $this->resource->listSummary(),
            'occurredAt' => $this->resource->occurred_at?->toIso8601String(),
            'durationMinutes' => $this->resource->duration_minutes,
            'kind' => $this->resource->kind->value,
            'feelings' => array_map(fn ($f) => $f->value, $this->resource->feelingIds()),
            'whatHappened' => $this->resource->what_happened,
            'memory' => $this->resource->memory,
            'belief' => $this->resource->belief,
            'forgiveness' => $this->resource->forgiveness,
            'note' => $this->resource->note,
            'calmerRating' => $this->resource->calmer_rating?->value,
            'reachedFinalStep' => (bool) $this->resource->reached_final_step,
            'sharedWithCoach' => (bool) $this->resource->shared_with_coach,
        ];
    }
}
