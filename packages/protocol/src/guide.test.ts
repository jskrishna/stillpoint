import { describe, expect, it } from 'vitest';
import { scriptedGuide, toCapture } from './guide.js';
import { startSession } from './session.js';
import { BASELINE, editStep } from './version.js';

const V = editStep(BASELINE, 'notice', {
  main: 'What happened?',
  backups: ['Can you say a little more?', 'Even a sentence helps.'],
  doneWhen: 'The user answers.',
  maxGuideTurns: 3,
});

describe('scriptedGuide', () => {
  it('opens with the step’s main question', () => {
    expect(scriptedGuide.respond({ session: startSession(), version: V, utterance: '' })).toEqual({
      say: 'What happened?',
      advance: false,
    });
  });

  it('advances on a substantial answer and says nothing extra', () => {
    const reply = scriptedGuide.respond({
      session: startSession(),
      version: V,
      utterance: 'My manager called me out',
    });
    expect(reply.advance).toBe(true);
    expect(reply.say).toBe('');
  });

  it('treats a one-word answer as too thin', () => {
    const reply = scriptedGuide.respond({ session: startSession(), version: V, utterance: 'work' });
    expect(reply.advance).toBe(false);
    expect(reply.say).toBe('Can you say a little more?');
  });

  it('says nothing for a session that has ended', () => {
    const ended = { ...startSession(), stepId: null };
    expect(scriptedGuide.respond({ session: ended, version: V, utterance: 'hi' })).toEqual({
      say: '',
      advance: false,
    });
  });

  it('captures nothing — interpretation is not its job', () => {
    const reply = scriptedGuide.respond({
      session: startSession(),
      version: V,
      utterance: 'My manager called me out',
    });
    expect(reply.capture).toBeUndefined();
  });
});

describe('toCapture', () => {
  it('passes through what was extracted', () => {
    expect(toCapture({ belief: 'I am not enough', feelings: ['sad'] })).toEqual({
      belief: 'I am not enough',
      feelings: ['sad'],
    });
  });

  it('omits fields rather than setting them undefined', () => {
    const capture = toCapture({ belief: 'x' });
    expect(capture).toEqual({ belief: 'x' });
    expect('feelings' in (capture ?? {})).toBe(false);
  });

  it('is undefined when there is nothing to record', () => {
    expect(toCapture(undefined)).toBeUndefined();
  });
});
