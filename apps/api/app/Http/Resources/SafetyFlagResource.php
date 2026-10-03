<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\UserHandle;
use App\Models\SafetyFlag;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A safety flag as a reviewer sees it.
 *
 * The excerpt is the user's own words at the moment they said they were not
 * safe — the most sensitive column in the schema. It is here because a reviewer
 * cannot do their job without it, and nowhere else.
 *
 * The user is identified by a short opaque handle rather than a name or an
 * email: the queue is for judging a flag, not for recognising a person.
 *
 * @property SafetyFlag $resource
 */
final class SafetyFlagResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $flag = $this->resource;

        return [
            'id' => $flag->id,
            'sessionId' => $flag->guided_session_id,
            'user' => UserHandle::for($flag->user_id),
            'level' => $flag->level->value,
            'category' => $flag->category->value,
            'categoryLabel' => $flag->category->label(),
            'excerpt' => $flag->excerpt,
            'outcome' => $flag->outcome,
            'status' => $flag->status,
            'raisedAt' => $flag->raised_at?->toIso8601String(),
            'reviewedAt' => $flag->reviewed_at?->toIso8601String(),
        ];
    }
}
