import { describe, expect, it } from 'vitest';
import { feelingsIn, isSubstantiveAnswer, literalExtraction } from './extraction.js';

describe('feelingsIn', () => {
  it('reads the ids a step 3 answer carries', () => {
    expect(feelingsIn('angry sad')).toEqual(['angry', 'sad']);
  });

  it('accepts the separators a client might use', () => {
    expect(feelingsIn('angry, sad; hurt')).toEqual(['angry', 'sad', 'hurt']);
  });

  it('ignores anything that is not a feeling', () => {
    expect(feelingsIn('furious livid cross')).toEqual([]);
  });

  it('does not repeat a feeling named twice', () => {
    expect(feelingsIn('sad sad')).toEqual(['sad']);
  });
});

describe('isSubstantiveAnswer', () => {
  it('takes one named feeling as an answer to step 3', () => {
    // The whole point: a word count stalled step 3 for anyone who did not
    // happen to pick exactly three feelings.
    expect(isSubstantiveAnswer('feel', 'angry')).toBe(true);
  });

  it('does not take an unnamed feeling as an answer', () => {
    expect(isSubstantiveAnswer('feel', 'i am not sure what i feel')).toBe(false);
  });

  it('wants more than two words of prose', () => {
    expect(isSubstantiveAnswer('notice', 'my manager dismissed my work')).toBe(true);
    expect(isSubstantiveAnswer('notice', 'dunno')).toBe(false);
  });
});

describe('literalExtraction', () => {
  it('takes step 1 at face value, and titles the session with it', () => {
    expect(literalExtraction('notice', 'My manager dismissed my work')).toEqual({
      whatHappened: 'My manager dismissed my work',
      title: 'My manager dismissed my work',
    });
  });

  it('shortens a long title', () => {
    const long = 'a'.repeat(100);
    expect(literalExtraction('notice', long)?.title).toHaveLength(60);
  });

  it('records step 3 as feeling ids, not as text', () => {
    expect(literalExtraction('feel', 'angry, hurt')).toEqual({ feelings: ['angry', 'hurt'] });
  });

  it('records nothing for step 3 when no feeling was named', () => {
    expect(literalExtraction('feel', 'bad')).toBeUndefined();
  });

  it('records step 4 as the memory', () => {
    expect(literalExtraction('remember', 'Being talked over at nine')).toEqual({
      memory: { description: 'Being talked over at nine' },
    });
  });

  it('records step 5 as the belief, and phrases the forgiveness', () => {
    expect(literalExtraction('inquire', 'I’m not good enough')).toEqual({
      belief: 'I’m not good enough',
      forgiveness: 'Forgive me for believing that I am not good enough.',
    });
  });

  it('records nothing for the steps the designs give no field', () => {
    expect(literalExtraction('responsibility', 'I see it now')).toBeUndefined();
    expect(literalExtraction('forgive', 'I let it go')).toBeUndefined();
  });

  it('records nothing for an empty answer', () => {
    expect(literalExtraction('notice', '   ')).toBeUndefined();
  });
});
