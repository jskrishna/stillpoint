<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Contracts\Pagination\CursorPaginator;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A page of a collection.
 *
 * Resource responses in this API carry no `data` envelope (see
 * AppServiceProvider), and a plain list has none. A page needs somewhere to put
 * the cursor, so the paged endpoints have one — named and documented rather
 * than inherited from the framework, and the same shape for every one of them:
 *
 *     { "items": [...], "nextCursor": "..." | null, "total": 42 }
 *
 * There are **five**: the journal, the safety queue, the accounts list, the
 * role trail and the plan trail. This said "these two endpoints" and "both
 * lists" for as long as there have been more than two, which is the drift the
 * root `CLAUDE.md` keeps catching in its own prose — a count in a comment is
 * a claim nothing checks. Do not write the number here again without the list
 * beside it.
 *
 * Cursor pagination rather than offsets: these lists are ordered by time or by
 * name and grow while they are read, and an offset page silently repeats or
 * skips a row when something is inserted between two requests. For the safety
 * queue that would mean a reviewer never seeing a flag.
 */
final class Paged
{
    /**
     * @param  class-string<JsonResource>  $resource
     * @return array<string, mixed>
     */
    public static function of(CursorPaginator $page, string $resource, Request $request, ?int $total = null): array
    {
        return [
            'items' => $resource::collection($page->items())->toArray($request),
            'nextCursor' => $page->nextCursor()?->encode(),
            'total' => $total,
        ];
    }

    /**
     * A page size from the request, bounded.
     *
     * Bounded on purpose: these rows are encrypted and decrypted one at a time,
     * so an unbounded page is a way to make the server do unbounded work.
     */
    public static function limit(Request $request, int $default, int $max = 100): int
    {
        $asked = (int) $request->query('limit', (string) $default);

        // Anything that is not a page size falls back to the default rather
        // than to the nearest legal value: `limit=-5` meaning "one row" would
        // be a surprising thing to infer from it, and `limit=nonsense` casts
        // to zero, which means nothing either.
        return $asked < 1 ? $default : min($max, $asked);
    }
}
