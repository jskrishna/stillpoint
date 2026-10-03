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
  const points = [...utterance];
  return points.length <= RECORDED_UTTERANCE_LIMIT
    ? utterance
    : points.slice(0, RECORDED_UTTERANCE_LIMIT).join('');
}
