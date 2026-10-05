<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * White space, as the TypeScript port means it.
 *
 * PHP's `trim()` removes six ASCII bytes and `\s` without the `u` modifier
 * matches ASCII only, while JavaScript's `trim()` and `\s` both mean every
 * Unicode space: the no-break space, the narrow one a French keyboard puts
 * before a question mark, the ideographic space an East Asian keyboard types.
 * So the two languages disagreed about where an answer starts and ends and how
 * many words are in it. Measured on one battery run through both: 57 answers
 * of 300 came out differently, and all 57 were this.
 *
 * What a person would have met is the word count. "Pourquoi moi ?" is three
 * words to the browser and two to the server, since the space before the
 * question mark is U+202F, and an answer of three words separated by
 * ideographic spaces is one word here. The server is the one that decides
 * whether a step moves on.
 *
 * The class below is JavaScript's exactly, written out rather than as `\s`
 * under `u`: PCRE's Unicode `\s` adds U+0085 and leaves out U+FEFF, and JS has
 * it the other way round. `packages/protocol` is the specification, so this is
 * the side that says what it means.
 */
final class Text
{
    /** ECMAScript's WhiteSpace and LineTerminator, as a character class body. */
    private const SPACE = '\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}'
        .'\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

    /** `String.prototype.trim()`. */
    public static function trim(string $text): string
    {
        // Null only for text that is not valid UTF-8, which nothing here can
        // read as characters at all; PHP's own trim is the honest fallback.
        return preg_replace('/^['.self::SPACE.']+|['.self::SPACE.']+$/u', '', $text) ?? trim($text);
    }

    /**
     * `text.trim().split(/\s+/).filter(Boolean)`.
     *
     * @return list<string>
     */
    public static function words(string $text): array
    {
        $parts = preg_split('/['.self::SPACE.']+/u', self::trim($text), -1, PREG_SPLIT_NO_EMPTY);

        return $parts === false ? [] : $parts;
    }

    /** `text.replace(/\s+/g, ' ')`. */
    public static function collapse(string $text): string
    {
        return preg_replace('/['.self::SPACE.']+/u', ' ', $text) ?? $text;
    }
}
