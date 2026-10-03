import { describe, expect, it } from 'vitest';
import {
  apply,
  applyAll,
  currentOrdinal,
  isUntouched,
  isOutOfGuideTurns,
  startSession,
  type SessionEvent,
} from './session.js';
import { STEP_ORDER } from './steps.js';
import { BASELINE, editStep, type ProtocolVersion } from './version.js';

const satisfy: SessionEvent = { type: 'step_satisfied' };

describe('starting a session', () => {
  it('opens on step 1 with nothing gathered', () => {
    const s = startSession();
    expect(s.phase).toBe('in_step');
    expect(s.stepId).toBe('notice');
    expect(s.guideTurnsUsed).toBe(0);
    expect(s.data.feelings).toEqual([]);
    expect(s.endReason).toBeNull();
    expect(s.safetyLevel).toBe('none');
  });

  it('reports the step number the user sees', () => {
    expect(currentOrdinal(startSession())).toBe(1);
  });
});

describe('walking the steps', () => {
  it('advances one step at a time', () => {
    let s = startSession();
    for (const id of STEP_ORDER) {
      expect(s.stepId).toBe(id);
      s = apply(s, satisfy);
    }
    expect(s.phase).toBe('ended');
    expect(s.endReason).toBe('completed');
    expect(s.stepId).toBeNull();
    expect(currentOrdinal(s)).toBeNull();
  });

  it('resets the guide turn count on each new step', () => {
    const s = applyAll(startSession(), [{ type: 'guide_turn' }, { type: 'guide_turn' }, satisfy]);
    expect(s.stepId).toBe('responsibility');
    expect(s.guideTurnsUsed).toBe(0);
  });

  it('counts guide turns within a step', () => {
    const s = applyAll(startSession(), [{ type: 'guide_turn' }, { type: 'guide_turn' }]);
    expect(s.guideTurnsUsed).toBe(2);
  });

  it('does not mutate the session it is given', () => {
    const s = startSession();
    apply(s, satisfy);
    expect(s.stepId).toBe('notice');
    expect(s.phase).toBe('in_step');
  });
});

describe('gathering what the summary reports', () => {
  it('collects the fields the summary screen shows', () => {
    const s = applyAll(startSession(), [
      { type: 'step_satisfied', capture: { whatHappened: 'Manager pointed out my mistake' } },
      satisfy,
      {
        type: 'step_satisfied',
        capture: { feelings: ['ashamed', 'hangry', 'rejected', 'unworthy'] },
      },
      { type: 'step_satisfied', capture: { memory: { description: 'Class 3', age: 8 } } },
      { type: 'step_satisfied', capture: { belief: 'I’m not good enough.' } },
      satisfy,
    ]);

    expect(s.endReason).toBe('completed');
    expect(s.data.whatHappened).toBe('Manager pointed out my mistake');
    expect(s.data.memory).toEqual({ description: 'Class 3', age: 8 });
    expect(s.data.belief).toBe('I’m not good enough.');
    // "hangry" is not in the taxonomy, so it is dropped rather than stored;
    // "ashamed" is, so it survives.
    expect(s.data.feelings).toEqual(['ashamed', 'rejected', 'unworthy']);
  });

  it('keeps earlier captures as later steps add to them', () => {
    const s = applyAll(startSession(), [
      { type: 'step_satisfied', capture: { whatHappened: 'Something happened' } },
      { type: 'step_satisfied', capture: { belief: 'I am not enough' } },
    ]);
    expect(s.data.whatHappened).toBe('Something happened');
    expect(s.data.belief).toBe('I am not enough');
  });
});

describe('safety', () => {
  it('stops the session the moment a crisis is detected', () => {
    const s = apply(startSession(), { type: 'safety_signal', level: 'high' });
    expect(s.phase).toBe('ended');
    expect(s.endReason).toBe('safety_stop');
    expect(s.stepId).toBeNull();
    expect(s.safetyLevel).toBe('high');
  });

  it('records a concern without stopping', () => {
    const s = apply(startSession(), { type: 'safety_signal', level: 'medium' });
    expect(s.phase).toBe('in_step');
    expect(s.stepId).toBe('notice');
    expect(s.safetyLevel).toBe('medium');
  });

  it('never lowers the safety level once raised', () => {
    const s = applyAll(startSession(), [
      { type: 'safety_signal', level: 'medium' },
      { type: 'safety_signal', level: 'none' },
    ]);
    expect(s.safetyLevel).toBe('medium');
  });

  it('cannot be resumed after a safety stop', () => {
    const stopped = apply(startSession(), { type: 'safety_signal', level: 'high' });
    const after = applyAll(stopped, [satisfy, { type: 'guide_turn' }]);
    expect(after).toEqual(stopped);
    expect(after.endReason).toBe('safety_stop');
  });
});

describe('the user stopping', () => {
  it('ends the session whenever they choose', () => {
    const s = applyAll(startSession(), [satisfy, { type: 'user_stopped' }]);
    expect(s.phase).toBe('ended');
    expect(s.endReason).toBe('user_stopped');
  });

  it('keeps what was gathered before they stopped', () => {
    const s = applyAll(startSession(), [
      { type: 'step_satisfied', capture: { whatHappened: 'A hard day' } },
      { type: 'user_stopped' },
    ]);
    expect(s.data.whatHappened).toBe('A hard day');
  });
});

describe('the summary rating', () => {
  it('is accepted after the session completes', () => {
    let s = startSession();
    for (const _ of STEP_ORDER) s = apply(s, satisfy);
    s = apply(s, { type: 'rated', rating: 'a_little' });
    expect(s.data.calmerRating).toBe('a_little');
    expect(s.endReason).toBe('completed');
  });

  it('is accepted even after a safety stop, without reopening the session', () => {
    const stopped = apply(startSession(), { type: 'safety_signal', level: 'high' });
    const rated = apply(stopped, { type: 'rated', rating: 'no' });
    expect(rated.phase).toBe('ended');
    expect(rated.data.calmerRating).toBe('no');
  });
});

describe('guide turn limits', () => {
  it('runs out after the step’s maximum', () => {
    // Step 4 "Remember" allows 4 guide turns.
    let s = startSession();
    for (const _ of ['notice', 'responsibility', 'feel']) s = apply(s, satisfy);
    expect(s.stepId).toBe('remember');
    expect(isOutOfGuideTurns(s)).toBe(false);

    for (let i = 0; i < 4; i++) s = apply(s, { type: 'guide_turn' });
    expect(isOutOfGuideTurns(s)).toBe(true);
  });

  it('treats a step with no stated limit as unlimited, not as zero', () => {
    const s = startSession();
    expect(s.stepId).toBe('notice');
    expect(isOutOfGuideTurns(s)).toBe(false);
    expect(isOutOfGuideTurns(applyAll(s, [{ type: 'guide_turn' }, { type: 'guide_turn' }]))).toBe(
      false,
    );
  });

  it('is false once the session has ended', () => {
    expect(isOutOfGuideTurns(apply(startSession(), { type: 'user_stopped' }))).toBe(false);
  });
});

describe('pinning to a protocol version', () => {
  it('records nothing when no version is named', () => {
    expect(startSession().protocolVersion).toBeNull();
  });

  it('records the version it started on', () => {
    expect(startSession('full', { major: 1, minor: 4 }).protocolVersion).toEqual({
      major: 1,
      minor: 4,
    });
  });

  it('reads the turn limit from the version the session was given', () => {
    // The baseline allows 4 guide turns on step 4; this draft allows 1.
    const tightened: ProtocolVersion = editStep(BASELINE, 'remember', { maxGuideTurns: 1 });

    let s = startSession('full', tightened.number);
    for (const _ of ['notice', 'responsibility', 'feel']) s = apply(s, satisfy);
    expect(s.stepId).toBe('remember');

    s = apply(s, { type: 'guide_turn' });
    expect(isOutOfGuideTurns(s, tightened)).toBe(true);
    // The baseline's own limit of 4 is not yet reached.
    expect(isOutOfGuideTurns(s, BASELINE)).toBe(false);
    expect(isOutOfGuideTurns(s)).toBe(false);
  });

  it('keeps the pinned version across the whole session', () => {
    const pin = { major: 2, minor: 3 };
    const s = applyAll(startSession('quick', pin), [satisfy, satisfy, { type: 'user_stopped' }]);
    expect(s.protocolVersion).toEqual(pin);
  });
});

describe('a session nothing has been said into', () => {
  /**
   * The cost this guards. `POST /sessions` ends whatever was open and starts
   * another, and a free plan gets three full sessions a week — so a reply
   * dropped on the way back, or a double tap, used to spend a second allowance
   * on the same attempt.
   */
  it('is a session exactly as it was started', () => {
    expect(isUntouched(startSession())).toBe(true);
    expect(isUntouched(startSession('quick'))).toBe(true);
  });

  it('is not one that has been answered', () => {
    const answered = apply(startSession(), {
      type: 'step_satisfied',
      capture: { whatHappened: 'My manager dismissed my work' },
    });
    expect(isUntouched(answered)).toBe(false);
  });

  it('is not one the guide has already spoken a second time into', () => {
    // A backup question was asked, so the person said something that did not
    // satisfy the step. That is not an empty session.
    expect(isUntouched(apply(startSession(), { type: 'guide_turn' }))).toBe(false);
  });

  /**
   * The one that matters most. A session that screened a signal has had
   * something said into it that a reviewer may be reading, and handing it back
   * as "empty" would make a safety flag look like it belonged to a session
   * nobody had used.
   */
  it('is not one that has seen a safety signal', () => {
    const flagged = apply(startSession(), { type: 'safety_signal', level: 'medium' });
    expect(isUntouched(flagged)).toBe(false);
  });

  it('is not one that has ended', () => {
    const stopped = apply(startSession(), { type: 'safety_signal', level: 'high' });
    expect(stopped.phase).toBe('ended');
    expect(isUntouched(stopped)).toBe(false);
  });

  it('is not one with only feelings picked', () => {
    const picked = apply(startSession(), {
      type: 'step_satisfied',
      capture: { feelings: ['anger'] },
    });
    expect(isUntouched(picked)).toBe(false);
  });
});
