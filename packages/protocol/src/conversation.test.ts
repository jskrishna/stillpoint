import { describe, expect, it, vi } from 'vitest';
import { guideConsulted, openingLine, takeTurn } from './conversation.js';
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

/** A guide that fails the test if it is consulted at all. */
const neverCalled: Guide = {
  respond: () => {
    throw new Error('the guide must not be consulted here');
  },
};

describe('the guide budget', () => {
  /**
   * A rate limit must never gate the screen.
   *
   * This is not a convenience: a limit that refuses a request before it is
   * screened can refuse someone saying they are not safe, and then the
   * helplines never appear. These tests are the ordering, stated.
   */
  it('still stops a session for safety when the budget is spent', () => {
    const result = takeTurn(startSession(), BASELINE, 'I want to kill myself', {
      guide: neverCalled,
      risk: baselineRiskScreen,
      guideAvailable: false,
    });

    expect(result.stopped).toBe(true);
    expect(result.throttled).toBe(false);
    expect(result.session.endReason).toBe('safety_stop');
    expect(result.flag?.category).toBe('self_harm');
  });

  it('still records a medium signal when the budget is spent', () => {
    const result = takeTurn(startSession(), BASELINE, 'he hit me again last night', {
      guide: neverCalled,
      risk: baselineRiskScreen,
      guideAvailable: false,
    });

    // The turn goes no further, but the flag a reviewer needs is raised.
    expect(result.throttled).toBe(true);
    expect(result.flag?.level).toBe('medium');
    expect(result.session.safetyLevel).toBe('medium');
  });

  it('withholds the guide rather than advancing, when the budget is spent', () => {
    const result = takeTurn(startSession(), BASELINE, 'My manager dismissed my work', {
      guide: neverCalled,
      risk: baselineRiskScreen,
      guideAvailable: false,
    });

    expect(result.throttled).toBe(true);
    expect(result.advanced).toBe(false);
    expect(result.say).toBe('');
    expect(result.session.stepId).toBe('notice');
  });

  it('does not count a safety stop as the guide having been consulted', () => {
    const stopped = takeTurn(startSession(), BASELINE, 'I want to kill myself', {
      guide: neverCalled,
      risk: baselineRiskScreen,
    });
    const refused = takeTurn(startSession(), BASELINE, 'My manager dismissed my work', {
      guide: neverCalled,
      risk: baselineRiskScreen,
      guideAvailable: false,
    });

    // Neither should be charged for: a stop never reaches the guide, and a
    // refusal is the caller being told to wait, not work done for them.
    expect(guideConsulted(stopped)).toBe(false);
    expect(guideConsulted(refused)).toBe(false);
  });

  it('consults the guide when there is budget', () => {
    const result = takeTurn(startSession(), BASELINE, 'My manager dismissed my work', {
      guide: scriptedGuide,
      risk: baselineRiskScreen,
      guideAvailable: true,
    });

    expect(result.throttled).toBe(false);
    expect(result.advanced).toBe(true);
    expect(guideConsulted(result)).toBe(true);
  });
});

describe('an answer to a step that has moved on', () => {
  /**
   * The bug this closes, stated as a test.
   *
   * A client sends an answer, the response is dropped on the way back, and the
   * client sends the same words again. Without `answering`, the second request
   * is indistinguishable from a new turn: the words are recorded against the
   * *next* step, and the question that step actually asks is never answered by
   * anybody. On a phone on mobile data that is not an edge case.
   */
  it('is refused rather than applied to the step now in progress', () => {
    const first = takeTurn(startSession(), V, 'My manager called me out in front of everyone', {
      ...deps,
      answering: 'notice',
    });
    expect(first.session.stepId).toBe('responsibility');

    // The retry, carrying the step the client still thinks it is on.
    const retry = takeTurn(first.session, V, 'My manager called me out in front of everyone', {
      ...deps,
      answering: 'notice',
    });

    expect(retry.stale).toBe(true);
    expect(retry.advanced).toBe(false);
    expect(retry.say).toBe('');
    expect(retry.session.stepId).toBe('responsibility');
    expect(retry.session.data.whatHappened).toBe('My manager called me out in front of everyone');
  });

  it('does not consult the guide, and is not charged for', () => {
    const session = apply(startSession(), { type: 'step_satisfied' });
    const result = takeTurn(session, V, 'My manager called me out', {
      guide: neverCalled,
      risk: baselineRiskScreen,
      answering: 'notice',
    });

    expect(result.stale).toBe(true);
    expect(guideConsulted(result)).toBe(false);
  });

  /**
   * The ordering rule, again. Nothing about which step a client thinks it is
   * on may refuse a turn before anything has looked at what was said — the
   * request it would refuse is someone saying they are not safe.
   */
  it('still stops the session when the stale answer says someone is not safe', () => {
    const session = apply(startSession(), { type: 'step_satisfied' });
    const result = takeTurn(session, V, 'I want to kill myself', {
      guide: neverCalled,
      risk: baselineRiskScreen,
      answering: 'notice',
    });

    expect(result.stopped).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.session.endReason).toBe('safety_stop');
    expect(result.flag?.category).toBe('self_harm');
  });

  it('still raises a medium flag on a stale answer', () => {
    const session = apply(startSession(), { type: 'step_satisfied' });
    const result = takeTurn(session, V, 'he hit me again last night', {
      guide: neverCalled,
      risk: baselineRiskScreen,
      answering: 'notice',
    });

    // The words were said. That they answered a question the session has
    // moved past does not make them less of a disclosure.
    expect(result.stale).toBe(true);
    expect(result.flag?.level).toBe('medium');
    expect(result.session.safetyLevel).toBe('medium');
  });

  it('applies the answer when the caller names the step in progress', () => {
    const result = takeTurn(startSession(), V, 'My manager called me out in front of everyone', {
      ...deps,
      answering: 'notice',
    });

    expect(result.stale).toBe(false);
    expect(result.advanced).toBe(true);
  });

  /**
   * A caller that cannot say is treated as not having said, rather than as a
   * mismatch. A check that refuses what it cannot understand would refuse a
   * crisis, and the step is carried in the request body where anything may
   * arrive.
   */
  it('applies the answer when the caller does not say which step it is on', () => {
    const session = apply(startSession(), { type: 'step_satisfied' });
    const result = takeTurn(session, V, 'I snapped at him first', deps);

    expect(result.stale).toBe(false);
    expect(result.advanced).toBe(true);
  });
});

describe('what the guide says after an answer', () => {
  /**
   * The bug this closes, stated as a test.
   *
   * The scripted guide answers an advancing turn with nothing, because
   * acknowledgement copy is not in the designs and inventing it would be
   * inventing the guide's voice. So `say` was empty on every turn that moved
   * the step on, and the client — which renders `say` and shows "this step has
   * no question yet" when it is empty — went silent for the rest of the
   * session. Five of the six steps, whether or not the step had copy, on every
   * surface.
   */
  it('asks the new step’s question when the step moves on', () => {
    const result = takeTurn(startSession(), V, 'My manager called me out in front of everyone', {
      ...deps,
      answering: 'notice',
    });

    expect(result.advanced).toBe(true);
    expect(result.session.stepId).toBe('responsibility');
    expect(result.say).toBe('Main question for responsibility?');
  });

  it('keeps asking the same step’s backup when the answer was too thin', () => {
    const result = takeTurn(startSession(), V, 'dunno', deps);

    expect(result.advanced).toBe(false);
    expect(result.say).toBe('Backup one for notice?');
  });

  it('says nothing once the last step is satisfied, because the session is over', () => {
    // Step 3 is answered by naming a feeling, not in prose, so a generic
    // sentence does not satisfy it.
    const answers = [
      'My manager called me out in front of everyone',
      'I told myself I was not good enough',
      'angry',
      'Being talked over at school when I was nine',
      'I am not good enough',
      'I forgive myself for believing that',
    ];

    let session = startSession();
    let say = 'not empty yet';
    for (const answer of answers) {
      const result = takeTurn(session, V, answer, deps);
      expect(result.advanced, answer).toBe(true);
      session = result.session;
      say = result.say;
    }

    expect(session.endReason).toBe('completed');
    // The turn that finished it has nothing to ask: there is no next step, and
    // the summary screen takes over from here.
    expect(say).toBe('');
  });

  it('says nothing on a safety stop, because the safety screen takes over', () => {
    const result = takeTurn(startSession(), BASELINE, 'I want to kill myself', {
      guide: neverCalled,
      risk: baselineRiskScreen,
    });

    expect(result.stopped).toBe(true);
    expect(result.say).toBe('');
  });

  /**
   * A step whose copy is still owed reads as silence, which is the honest
   * answer: the client says so in as many words rather than inventing a
   * question of its own.
   */
  it('says nothing when the step it moved to has no question yet', () => {
    const result = takeTurn(startSession(), BASELINE, 'My manager called me out', {
      guide: scriptedGuide,
      risk: noRiskScreen,
    });

    expect(result.session.stepId).toBe('responsibility');
    expect(result.say).toBe('');
  });
});
