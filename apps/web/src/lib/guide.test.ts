import { describe, expect, it } from 'vitest';
import { BASELINE, editStep, startSession, type Guide } from '@stillpoint/protocol';
import { webGuide, withLiteralCapture } from './guide.js';

const V = editStep(BASELINE, 'notice', {
  main: 'What happened?',
  backups: ['Say a little more?'],
  doneWhen: 'answered',
  maxGuideTurns: 3,
});

const at = (stepId: 'notice' | 'remember' | 'inquire' | 'feel', utterance: string) => ({
  session: { ...startSession(), stepId },
  version: V,
  utterance,
});

describe('withLiteralCapture', () => {
  it('records what happened at step 1', () => {
    const reply = webGuide.respond(at('notice', 'My manager called me out at work'));
    expect(reply.advance).toBe(true);
    expect(reply.capture).toEqual({
      whatHappened: 'My manager called me out at work',
      title: 'My manager called me out at work',
    });
  });

  it('records the memory at step 4', () => {
    const reply = webGuide.respond(at('remember', 'Teacher read my wrong answer out loud'));
    expect(reply.capture).toEqual({
      memory: { description: 'Teacher read my wrong answer out loud' },
    });
  });

  it('records the belief and phrases the forgiveness at step 5', () => {
    const reply = webGuide.respond(at('inquire', 'I’m not good enough.'));
    expect(reply.capture).toEqual({
      belief: 'I’m not good enough.',
      forgiveness: 'Forgive me for believing that I am not good enough.',
    });
  });

  it('records nothing for a step whose answer it cannot read', () => {
    expect(webGuide.respond(at('feel', 'I feel quite bad today')).capture).toBeUndefined();
  });

  it('records nothing when the step does not advance', () => {
    const reply = webGuide.respond(at('notice', 'no'));
    expect(reply.advance).toBe(false);
    expect(reply.capture).toBeUndefined();
  });

  it('truncates a long answer into a journal title', () => {
    // Several words, because a single long word is not a substantive answer
    // and the guide would not advance on it.
    const long = 'word '.repeat(30).trim();
    const reply = webGuide.respond(at('notice', long));
    expect(reply.capture?.title).toHaveLength(60);
    expect(reply.capture?.whatHappened).toHaveLength(long.length);
  });

  it('does not advance on a single long word', () => {
    expect(webGuide.respond(at('notice', 'a'.repeat(120))).advance).toBe(false);
  });

  it('never overwrites a capture the base guide already made', () => {
    const opinionated: Guide = {
      respond: () => ({ say: '', advance: true, capture: { whatHappened: 'the model’s view' } }),
    };
    const reply = withLiteralCapture(opinionated).respond(at('notice', 'what I typed'));
    expect(reply.capture).toEqual({ whatHappened: 'the model’s view' });
  });
});
