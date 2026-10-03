/**
 * How much of one answer is kept.
 *
 * This is a **storage** bound and not a limit on what a person may say. The
 * distinction is the whole point of the file.
 *
 * It used to be a validation rule on the API's turns route —
 * `max:5000` — which made it a refusal in front of the safety screen, the same
 * objection as a rate limit there. A 5,222-character outpouring ending in "I
 * want to kill myself" answered 422 and was never screened: the longest thing
 * somebody writes is quite often the one that matters most, and 5,000
 * characters is roughly 800 words, which a person typing at 2am reaches.
 *
 * So nothing refuses a turn for its length any more. The screen reads every
 * character that arrives, and this bounds only what is written down
 * afterwards. Twenty thousand characters is about 3,300 words — far past any
 * answer to one question — so in practice nobody's words are trimmed; what the
 * bound stops is a client storing megabytes a turn, which matters because the
 * journal decrypts rows one at a time and "export my data" reads all of them.
 *
 * Mirrored by `App\Domain\Utterance::RECORDED_LIMIT`, and the parity fixture
 * carries the number so the two cannot drift.
 */
export const RECORDED_UTTERANCE_LIMIT = 20_000;

/**
 * What may be recorded from an utterance.
 *
 * Called **after** the screen has read the whole thing, never before it.
 *
 * Counts characters rather than bytes, and uses the string's code points, so
 * the limit is the same sentence in Devanagari as in Latin. Bytes would make
 * the same answer three times longer in Hindi, which would be the bound
 * quietly treating one language as more expensive than another.
 */
export function recordable(utterance: string): string {
  return firstCharacters(utterance, RECORDED_UTTERANCE_LIMIT);
}

/**
 * The first `n` characters of a string, counting whole ones.
 *
 * `slice` counts UTF-16 code units, which is neither what anybody means by a
 * character nor what PHP's `mb_substr` counts — so the same answer was being
 * truncated to two different lengths in the two languages, and the shorter of
 * them could end in half of a character. A journal title built with `slice`
 * ended in a replacement glyph as soon as somebody typed an emoji, which on a
 * phone is not an unusual thing to type.
 *
 * Code points rather than grapheme clusters: a flag or a family emoji is
 * several code points and this will still cut between them. That is a smaller
 * wrong than a lone surrogate, and `Intl.Segmenter` has no counterpart in the
 * PHP here, so matching it would reintroduce the divergence this removes.
 */
export function firstCharacters(text: string, n: number): string {
  const points = [...text];
  return points.length <= n ? text : points.slice(0, n).join('');
}
