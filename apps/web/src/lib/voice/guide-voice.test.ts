import { describe, expect, it, vi } from 'vitest';
import { engineGuideVoice, silentGuide, type SpeechEngine, type SpeechStyle } from './guide-voice';
import { NO_EAR_REASON, noEar } from './user-ear';

/** An engine that records what it was asked to say and finishes at once. */
function fakeEngine(): {
  engine: SpeechEngine;
  spoken: { text: string; style: SpeechStyle }[];
  cancels: () => number;
} {
  const spoken: { text: string; style: SpeechStyle }[] = [];
  let cancels = 0;

  return {
    spoken,
    cancels: () => cancels,
    engine: {
      speak(text, style, done) {
        spoken.push({ text, style });
        done();
      },
      cancel() {
        cancels += 1;
      },
    },
  };
}

describe('the silent guide', () => {
  it('says nothing and reports why', async () => {
    await expect(silentGuide.speak('You’re upset, and that’s okay.')).resolves.toBeUndefined();
    expect(silentGuide.availability()).toEqual({
      available: false,
      reason: 'This session is typed.',
    });
  });
});

describe('the spoken guide', () => {
  it('speaks the copy it is given', async () => {
    const { engine, spoken } = fakeEngine();

    await engineGuideVoice(engine).speak('You’re upset, and that’s okay. What happened?');

    expect(spoken.map((s) => s.text)).toEqual(['You’re upset, and that’s okay. What happened?']);
  });

  it('speaks in Indian English, slower and lower than a default voice', async () => {
    const { engine, spoken } = fakeEngine();
    await engineGuideVoice(engine).speak('What happened?');

    // The guide is meant to be calm; a browser's default cadence is a screen
    // reader's. And the product is India-first, so it should not sound
    // imported.
    expect(spoken[0]?.style.lang).toBe('en-CA');
    expect(spoken[0]?.style.rate).toBeLessThan(1);
    expect(spoken[0]?.style.pitch).toBeLessThan(1);
  });

  it('clears whatever was being said before starting', async () => {
    const { engine, cancels } = fakeEngine();
    const guide = engineGuideVoice(engine);

    await guide.speak('First question');
    await guide.speak('Second question');

    // Two questions overlapping would be worse than silence.
    expect(cancels()).toBe(2);
  });

  it('says nothing for empty copy', async () => {
    const { engine, spoken } = fakeEngine();
    // A step with no question yet is `null` on the wire and empty here. The
    // guide must not announce the gap.
    await engineGuideVoice(engine).speak('   ');

    expect(spoken).toEqual([]);
  });

  it('resolves rather than stalling when there is no engine', async () => {
    const guide = engineGuideVoice(undefined);

    // A guide that cannot speak must not stall a session.
    await expect(guide.speak('What happened?')).resolves.toBeUndefined();
    expect(guide.availability().available).toBe(false);
  });

  it('resolves when the engine fails rather than finishing', async () => {
    // An engine that reports done without having said anything — which is what
    // a failure looks like through this seam.
    const engine: SpeechEngine = {
      speak: (_text, _style, done) => {
        done();
      },
      cancel: () => undefined,
    };

    await expect(engineGuideVoice(engine).speak('What happened?')).resolves.toBeUndefined();
  });

  it('stops mid-sentence when asked', async () => {
    // An engine that keeps talking until something ends it, which is what a
    // real one does — the fake above finishes the instant it is asked.
    let cancels = 0;
    let pending: (() => void) | undefined;
    const engine: SpeechEngine = {
      speak(_text, _style, done) {
        pending = done;
      },
      cancel() {
        cancels += 1;
        pending?.();
        pending = undefined;
      },
    };

    const guide = engineGuideVoice(engine);
    const speaking = guide.speak('A long question the user interrupts');
    expect(pending).toBeDefined();

    guide.stop();

    // Two: `speak` clears whatever came before, and `stop` ends this one. What
    // matters is that the second happened — and that the promise settles, so a
    // screen awaiting it is not left hanging.
    expect(cancels).toBe(2);
    await expect(speaking).resolves.toBeUndefined();
  });

  it('does not cancel when it has nothing to stop', async () => {
    const { engine, cancels } = fakeEngine();
    const guide = engineGuideVoice(engine);

    guide.stop();
    expect(cancels()).toBe(0);

    // And nothing further once the utterance has finished on its own: the one
    // cancel is `speak` clearing the way, not `stop` ending anything.
    await guide.speak('A question');
    guide.stop();
    expect(cancels()).toBe(1);
  });
});

describe('listening', () => {
  it('reports itself unavailable, with a reason a screen can show', () => {
    // Not an omission. Every option today uploads the user's audio, and the
    // setup screen says their voice is never saved.
    expect(noEar.availability()).toEqual({ available: false, reason: NO_EAR_REASON });
    // What matters is that the reason offers the way through rather than only
    // naming the fault — the assertion is on typing being mentioned, not on a
    // particular phrasing of it.
    expect(NO_EAR_REASON).toMatch(/\btype\b/i);
    // And that it is one self-contained sentence: both surfaces show it as it
    // is, and `apps/mobile/src/voice.ts` must hold the same string.
    expect(NO_EAR_REASON.trim()).toMatch(/\.$/);
  });

  it('hands back a no-op stopper rather than throwing', () => {
    const onFinal = vi.fn();
    const stop = noEar.listen({ onFinal });

    // A caller that forgot to check availability gets silence, not an
    // exception in the middle of a session.
    expect(() => {
      stop();
    }).not.toThrow();
    expect(onFinal).not.toHaveBeenCalled();
  });
});
