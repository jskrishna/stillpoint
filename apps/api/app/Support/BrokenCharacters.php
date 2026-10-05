<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Http\Request;

/**
 * Reads a JSON body PHP refused because of one broken character.
 *
 * `json_decode` rejects a whole body for half a surrogate pair written as an
 * escape, or for a byte that is not UTF-8, and Laravel then sees a request
 * with no fields in it. On the turns route that is a refusal in front of the
 * risk screen: 422 "The utterance field is required." for an answer that was
 * all there apart from one character. See
 * `ABrokenCharacterIsNotARefusalTest` for the measurement.
 *
 * Only that route calls this. Everywhere else a body that will not decode is
 * a client's bug and a 422 is the right answer to it; here the cost of that
 * answer is somebody's words going unread.
 */
final class BrokenCharacters
{
    /**
     * Puts the decoded body on the request when, and only when, the body
     * decodes once its broken characters are replaced with U+FFFD.
     */
    public static function repair(Request $request): void
    {
        if (! $request->isJson() || $request->json()->count() > 0) {
            return;
        }

        $raw = (string) $request->getContent();
        if ($raw === '') {
            return;
        }

        $decoded = json_decode(self::withoutHalfPairs($raw), true, 512, JSON_INVALID_UTF8_SUBSTITUTE);

        if (is_array($decoded)) {
            $request->json()->replace($decoded);
        }
    }

    /**
     * Replaces each `\uXXXX` escape that is half a surrogate pair.
     *
     * The pattern walks escape by escape, so a doubled backslash is consumed
     * as one escape and the `ud83d` after it is ordinary text. A valid pair
     * matches the first alternative and is kept as it is.
     */
    private static function withoutHalfPairs(string $json): string
    {
        return preg_replace_callback(
            '/\\\\(?:u(?:d[89ab][0-9a-f]{2})\\\\u(?:d[c-f][0-9a-f]{2})|u(d[89a-f][0-9a-f]{2})|.)/is',
            fn (array $m): string => isset($m[1]) && $m[1] !== '' ? '\\ufffd' : $m[0],
            $json,
        ) ?? $json;
    }
}
