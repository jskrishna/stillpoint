import { describe, expect, it } from 'vitest';
import {
  incompleteSteps,
  isComplete,
  nextStep,
  STEP_COUNT,
  STEP_LIST,
  STEP_ORDER,
  step,
  stepAt,
} from './steps.js';

describe('step definitions', () => {
  it('has six steps', () => {
    expect(STEP_COUNT).toBe(6);
    expect(STEP_LIST).toHaveLength(6);
  });

  it('numbers ordinals 1..6 in declaration order', () => {
    expect(STEP_LIST.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps each step keyed by its own id', () => {
    for (const id of STEP_ORDER) {
      expect(step(id).id).toBe(id);
    }
  });

  it('runs notice → responsibility → feel → remember → inquire → forgive', () => {
    expect(STEP_ORDER).toEqual([
      'notice',
      'responsibility',
      'feel',
      'remember',
      'inquire',
      'forgive',
    ]);
  });
});

describe('navigation', () => {
  it('walks the whole protocol via nextStep', () => {
    const walked = ['notice'];
    let current = nextStep('notice');
    while (current !== undefined) {
      walked.push(current.id);
      current = nextStep(current.id);
    }
    expect(walked).toEqual([...STEP_ORDER]);
  });

  it('ends after the last step', () => {
    expect(nextStep('forgive')).toBeUndefined();
  });

  it('resolves steps by ordinal and rejects out-of-range ones', () => {
    expect(stepAt(1)?.id).toBe('notice');
    expect(stepAt(6)?.id).toBe('forgive');
    expect(stepAt(0)).toBeUndefined();
    expect(stepAt(7)).toBeUndefined();
  });
});

describe('completeness', () => {
  it('treats the fully specified step as complete', () => {
    const remember = step('remember');
    expect(isComplete(remember)).toBe(true);
    expect(remember.maxGuideTurns).toBe(4);
    expect(remember.doneWhen).toBe('A specific memory, age under 12');
    expect(remember.prompts.backups).toHaveLength(2);
  });

  it('treats a step with no prompt copy as incomplete', () => {
    expect(isComplete(step('responsibility'))).toBe(false);
  });

  it('reports the steps still awaiting copy from the PRD', () => {
    // Only step 4 "Remember" is fully specified anywhere in the designs. The
    // other five lack a completion criterion and a turn limit, and three lack
    // their question too. When the PRD fills them in, this list empties.
    expect(incompleteSteps().map((s) => s.id)).toEqual([
      'notice',
      'responsibility',
      'feel',
      'inquire',
      'forgive',
    ]);
  });

  it('has a question for the steps the designs quote, even where other fields are missing', () => {
    expect(step('notice').prompts.main).not.toBeNull();
    expect(step('inquire').prompts.main).not.toBeNull();
    expect(step('responsibility').prompts.main).toBeNull();
  });

  it('gives every step a name and a summary regardless of prompt copy', () => {
    for (const s of STEP_LIST) {
      expect(s.name).not.toBe('');
      expect(s.summary).not.toBe('');
    }
  });
});
