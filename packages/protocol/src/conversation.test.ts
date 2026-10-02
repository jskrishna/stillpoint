import { describe, expect, it, vi } from 'vitest';
import { openingLine, takeTurn } from './conversation.js';
import { scriptedGuide, type Guide } from './guide.js';
import { baselineRiskScreen, noRiskScreen } from './risk.js';
import { apply, startSession } from './session.js';
import { BASELINE, editStep, type ProtocolVersion } from './version.js';

/** A version with every step runnable, so the loop is what is under test. */
function runnable(): ProtocolVersion {
  let v = BASELINE;
  for (const id of [
    'notice',
    'responsibility',
    'feel',
    'remember',
    'inquire',
    'forgive',
  ] as const) {
    v = editStep(v, id, {
      main: `Main question for ${id}?`,
      backups: [`Backup one for ${id}?`, `Backup two for ${id}?`],
      doneWhen: 'The user answers.',
      maxGuideTurns: 3,
    });
  }
  return v;
}

const deps = { guide: scriptedGuide, risk: noRiskScreen };
const V = runnable();

describe('the turn loop', () => {
  it('opens a step with its main question', () => {
    expect(openingLine(startSession(), V, scriptedGuide)).toBe('Main question for notice?');
  });

  it('advances on a substantial answer', () => {
    const result = takeTurn(
      startSession(),
      V,
      'My manager called me out in front of everyone',
      deps,
    );
    expect(result.advanced).toBe(true);
    expect(result.session.stepId).toBe('responsibility');
    expect(result.stopped).toBe(false);
  });

  it('offers a backup when the answer is too thin', () => {
    const result = takeTurn(startSession(), V, 'dunno', deps);
    expect(result.advanced).toBe(false);
    expect(result.say).toBe('Backup one for notice?');
    expect(result.session.stepId).toBe('notice');
    expect(result.session.guideTurnsUsed).toBe(1);
  });

  it('works through the backups in order', () => {
    let session = startSession();
    const first = takeTurn(session, V, 'no', deps);
    session = first.session;
    const second = takeTurn(session, V, 'no', deps);
    expect(first.say).toBe('Backup one for notice?');
    expect(second.say).toBe('Backup two for notice?');
  });

  it('moves on rather than pressing someone who cannot answer', () => {
    // The version allows 3 guide turns; after them the step gives up.
    let session = startSession();
    for (let i = 0; i < 2; i++) session = takeTurn(session, V, 'no', deps).session;
    const last = takeTurn(session, V, 'no', deps);
    expect(last.advanced).toBe(true);
    expect(last.session.stepId).toBe('responsibility');
  });

  it('records what the guide captured', () => {
    const capturing: Guide = {
      respond: () => ({ say: '', advance: true, capture: { whatHappened: 'Called out at work' } }),
    };
    const result = takeTurn(startSession(), V, 'anything', {
      guide: capturing,
      risk: noRiskScreen,
    });
    expect(result.session.data.whatHappened).toBe('Called out at work');
  });

  it('leaves an ended session untouched', () => {
    const ended = apply(startSession(), { type: 'user_stopped' });
    const result = takeTurn(ended, V, 'something', deps);
    expect(result.session).toBe(ended);
    expect(result.say).toBe('');
  });
});

describe('safety comes first', () => {
  const safeDeps = { guide: scriptedGuide, risk: baselineRiskScreen };

  it('ends the session on a high-risk utterance', () => {
    const result = takeTurn(
      startSession(),
      V,
      'Sometimes I think everyone would be better off without me.',
      safeDeps,
    );
    expect(result.stopped).toBe(true);
    expect(result.session.phase).toBe('ended');
    expect(result.session.endReason).toBe('safety_stop');
  });

  it('never consults the guide on a high-risk utterance', () => {
    const respond = vi.fn();
    takeTurn(startSession(), V, 'I want to die', {
      guide: { respond },
      risk: baselineRiskScreen,
    });
    // A model answering someone who has just said they are not safe is exactly
    // what this ordering exists to prevent.
    expect(respond).not.toHaveBeenCalled();
  });

  it('says nothing back when it stops', () => {
    const result = takeTurn(startSession(), V, 'I want to die', safeDeps);
    expect(result.say).toBe('');
    expect(result.advanced).toBe(false);
  });

  it('raises a flag a reviewer can read', () => {
    const result = takeTurn(startSession(), V, 'I want to die', safeDeps);
    expect(result.flag).toEqual({
      level: 'high',
      category: 'self_harm',
      excerpt: 'I want to die',
    });
  });

  it('flags a medium signal without interrupting the session', () => {
    const result = takeTurn(startSession(), V, 'I stopped my meds last week honestly', safeDeps);
    expect(result.stopped).toBe(false);
    expect(result.session.phase).toBe('in_step');
    expect(result.flag?.level).toBe('medium');
    expect(result.session.safetyLevel).toBe('medium');
  });

  it('keeps a medium signal recorded after the turn proceeds', () => {
    let session = startSession();
    session = takeTurn(session, V, 'I stopped my meds last week honestly', safeDeps).session;
    session = takeTurn(session, V, 'anyway this is what happened at work', safeDeps).session;
    expect(session.safetyLevel).toBe('medium');
  });

  it('raises no flag for ordinary upset', () => {
    const result = takeTurn(startSession(), V, 'My manager called me out at work', safeDeps);
    expect(result.flag).toBeUndefined();
    expect(result.risk.level).toBe('none');
  });

  it('cannot be resumed after a safety stop', () => {
    const stopped = takeTurn(startSession(), V, 'I want to die', safeDeps).session;
    const after = takeTurn(stopped, V, 'actually I am fine, lets carry on', safeDeps);
    expect(after.session.phase).toBe('ended');
    expect(after.session.endReason).toBe('safety_stop');
    expect(after.advanced).toBe(false);
  });
});
