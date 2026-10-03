import { describe, expect, it } from 'vitest';
import { RECORDED_UTTERANCE_LIMIT, firstCharacters, recordable } from './utterance.js';

describe('what may be recorded from an utterance', () => {
  it('leaves an ordinary answer exactly as it was said', () => {
    const said = 'My manager called me out in front of everyone, and I went quiet.';
    expect(recordable(said)).toBe(said);
  });

  it('leaves an answer at the bound alone', () => {
    const said = 'a'.repeat(RECORDED_UTTERANCE_LIMIT);
    expect(recordable(said)).toBe(said);
  });

  it('keeps the beginning of a longer one', () => {
    const said = 'a'.repeat(RECORDED_UTTERANCE_LIMIT + 1000);
    expect(recordable(said)).toHaveLength(RECORDED_UTTERANCE_LIMIT);
    expect(recordable(said)).toBe('a'.repeat(RECORDED_UTTERANCE_LIMIT));
  });

  /**
   * Characters, not bytes. Devanagari is three bytes a character in UTF-8, so
   * a byte bound would let somebody say a third as much in Hindi as in English
   * — the bound quietly treating one language as more expensive than another,
   * in a product that is India-first.
   */
  it('counts characters rather than bytes', () => {
    const one = 'मुझे यह सब बहुत भारी लग रहा है। ';
    const said = one.repeat(Math.ceil((RECORDED_UTTERANCE_LIMIT + 100) / one.length));
    expect(said.length).toBeGreaterThan(RECORDED_UTTERANCE_LIMIT);
    expect([...recordable(said)]).toHaveLength(RECORDED_UTTERANCE_LIMIT);
  });

  /**
   * Code points, so the bound never lands in the middle of one. A naive
   * `slice` on a string of surrogate pairs can split an emoji into two halves
   * that render as a replacement character — which would be this function
   * corrupting the last thing somebody wrote.
   */
  it('does not cut a character in half', () => {
    const said = '😢'.repeat(RECORDED_UTTERANCE_LIMIT + 10);
    const kept = recordable(said);
    expect([...kept]).toHaveLength(RECORDED_UTTERANCE_LIMIT);
    expect(kept).not.toContain('�');
    expect(kept.endsWith('😢')).toBe(true);
  });

  it('is a bound on what is kept and not on what may be said', () => {
    // Stated as a test because the whole reason this file exists is that the
    // bound used to be `max:5000` on the API's turns route, which made it a
    // refusal in front of the safety screen. Nothing here refuses anything.
    expect(() => recordable('a'.repeat(500_000))).not.toThrow();
    expect(recordable('')).toBe('');
  });
});

describe('the first n characters of a string', () => {
  it('leaves a shorter string alone', () => {
    expect(firstCharacters('short', 60)).toBe('short');
    expect(firstCharacters('', 60)).toBe('');
  });

  /**
   * The bug this closes, stated as a test.
   *
   * `slice` counts UTF-16 code units. An emoji is two of them, so the journal
   * title built with `slice` was 30 characters where PHP's `mb_substr` gave 40
   * — the two languages storing different titles for the same answer — and the
   * shorter one could end in half of a character, which a journal shows as a
   * replacement glyph. On a phone an emoji is not an unusual thing to type.
   */
  it('counts characters, not UTF-16 code units', () => {
    const said = '😢'.repeat(40);
    expect(said.slice(0, 60)).toHaveLength(60); // what it used to do
    expect([...said.slice(0, 60)]).toHaveLength(30); // …which was 30 characters
    expect([...firstCharacters(said, 60)]).toHaveLength(40); // all of them
  });

  it('never cuts a character in half', () => {
    // `a` plus 40 emoji is 81 code units, so a 60-unit slice lands inside the
    // 30th emoji and leaves a lone surrogate behind.
    const said = `a${'😢'.repeat(40)}`;
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

    expect(lone.test(said.slice(0, 60))).toBe(true); // what it used to do
    expect(lone.test(firstCharacters(said, 60))).toBe(false);
  });

  it('cuts at the bound when the bound falls on a character', () => {
    const said = `${'x'.repeat(59)}😢`;
    expect([...firstCharacters(said, 60)]).toHaveLength(60);
    expect(firstCharacters(said, 60).endsWith('😢')).toBe(true);
  });

  /**
   * Code points and not grapheme clusters, deliberately: a flag or a family
   * emoji is several code points and this will still cut between them.
   * `Intl.Segmenter` has no counterpart in the PHP here, so matching it would
   * reintroduce the divergence this removes.
   */
  it('is honest about what it does not do', () => {
    const flag = '🇮🇳'; // two regional indicators, one glyph
    expect([...flag]).toHaveLength(2);
    expect(firstCharacters(flag, 1)).toBe('🇮');
  });
});
