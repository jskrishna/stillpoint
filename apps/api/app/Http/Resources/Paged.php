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
 * the cursor, so these two endpoints have one — named and documented rather
 * than inherited from the framework, and the same shape for both:
 *
 *     { "items": [...], "nextCursor": "..." | null, "total": 42 }
 *
 * Cursor pagination rather than offsets: both lists are ordered by time and
 * grow at the top, and an offset page silently repeats or skips a row when
 * something is inserted between two requests. For the safety queue that would
 * mean a reviewer never seeing a flag.
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
