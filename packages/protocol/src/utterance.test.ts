import { describe, expect, it } from 'vitest';
import { RECORDED_UTTERANCE_LIMIT, recordable } from './utterance.js';

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
