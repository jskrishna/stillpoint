import { describe, expect, it } from 'vitest';
import { baselineRiskScreen, noRiskScreen } from './risk.js';

const assess = (text: string) => baselineRiskScreen.assess(text);

describe('the baseline risk screen', () => {
  it('finds nothing in ordinary upset', () => {
    expect(assess('My manager called out my mistake in front of the whole team').level).toBe(
      'none',
    );
    expect(assess('I felt ashamed and rejected').level).toBe('none');
  });

  it('finds nothing in an empty or blank utterance', () => {
    expect(assess('').level).toBe('none');
    expect(assess('   \n  ').level).toBe('none');
  });

  it('catches the phrasing the designs themselves use', () => {
    const result = assess(
      'I keep messing up. Sometimes I think everyone would be better off without me.',
    );
    expect(result.level).toBe('high');
    expect(result.category).toBe('self_harm');
    expect(result.matched).toBe('better off without me');
  });

  it('catches explicit self-harm phrasings', () => {
    for (const text of [
      'I want to die',
      'I have been thinking about ending my life',
      'sometimes I just want to hurt myself',
      'there is no reason to live',
      'I wish I was dead',
    ]) {
      expect(assess(text).level, text).toBe('high');
    }
  });

  it('is not fooled by a curly apostrophe', () => {
    expect(assess('I don’t want to be here any more').level).toBe('high');
    expect(assess("I don't want to be here any more").level).toBe('high');
  });

  it('is not fooled by case or punctuation', () => {
    expect(assess('KILL MYSELF.').level).toBe('high');
    expect(assess('...kill   myself...').level).toBe('high');
  });

  it('reads across a line break from a transcript', () => {
    expect(assess('everyone would be\nbetter off without me').level).toBe('high');
  });

  it('grades harm to others', () => {
    expect(assess('I could hurt him').level).toBe('medium');
    expect(assess('I want to kill him').level).toBe('high');
  });

  it('grades the medical and trauma cases the queue shows', () => {
    expect(assess('I stopped my meds last week').category).toBe('medical');
    expect(assess('I stopped my meds last week').level).toBe('medium');
    expect(assess('he hit me when I was small').category).toBe('trauma');
  });

  it('takes the most severe match when an utterance trips several', () => {
    const result = assess('I stopped my meds and I want to die');
    expect(result.level).toBe('high');
    expect(result.category).toBe('self_harm');
  });

  it('reports what matched, so a reviewer can see why', () => {
    expect(assess('I want to die').matched).toBe('want to die');
  });

  it('leaves category unset when nothing matched', () => {
    expect(assess('a normal day').category).toBeUndefined();
  });
});

describe('noRiskScreen', () => {
  it('finds nothing, for tests that are not about safety', () => {
    expect(noRiskScreen.assess('I want to die').level).toBe('none');
  });
});
