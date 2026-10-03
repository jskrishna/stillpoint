/**
 * The Web Speech API, as a {@link SpeechEngine}.
 *
 * The only place in the app that knows what a `SpeechSynthesisUtterance` is.
 * It is kept here and not in `guide-voice.ts` so the guide's seam is shaped by
 * what a guide needs rather than by what one browser API happens to look like.
 */

import type { SpeechEngine, SpeechStyle } from './guide-voice';

/**
 * The browser's synthesiser, or `undefined` where there is none — on the server
 * during rendering, and in browsers without it.
 */
export function browserSpeechEngine(): SpeechEngine | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;

  const synthesis = window.speechSynthesis;

  return {
    speak(text: string, style: SpeechStyle, done: () => void): void {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = style.lang;
      utterance.rate = style.rate;
      utterance.pitch = style.pitch;

      // `done` exactly once, whichever way it ends. An error finishes rather
      // than rejecting: the session carries on without the voice.
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        done();
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      synthesis.speak(utterance);
    },

    cancel(): void {
      synthesis.cancel();
    },
  };
}
