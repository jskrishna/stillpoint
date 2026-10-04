/**
 * The guide's side of the voice loop.
 *
 * Two implementations: one that says nothing, and one that speaks through a
 * {@link SpeechEngine}. The engine is an argument rather than something reached
 * for globally, which is what makes these testable — and what will make the
 * next one (a vendor's streaming voice, behind a gateway) a sibling rather than
 * a rewrite.
 */

import type { GuideCopy } from '@stillpoint/client';
import type { Availability, GuideVoice } from './types';

/**
 * A guide that says nothing.
 *
 * The implementation for typed sessions, and the one a session falls back to.
 * It is not a failure case: typing is a first-class mode, and the designs offer
 * "I'll type instead" without ever asking for the microphone.
 */
export const silentGuide: GuideVoice = {
  id: 'silent',
  availability: () => ({ available: false, reason: 'This session is typed.' }),
  speak: () => Promise.resolve(),
  stop: () => undefined,
};

/** How the guide should sound. */
export interface SpeechStyle {
  readonly lang: string;
  readonly rate: number;
  readonly pitch: number;
}

/**
 * Whatever can say a sentence out loud.
 *
 * Deliberately narrow, and deliberately not shaped like the Web Speech API: a
 * vendor behind a gateway will not have utterances or event handlers, and the
 * seam should not make the browser's accident of design look like the
 * requirement. All a guide needs is "say this, tell me when you are done, and
 * stop if I ask".
 */
export interface SpeechEngine {
  /** Says `text`. Calls `done` exactly once, on finishing or on failing. */
  speak(text: GuideCopy, style: SpeechStyle, done: () => void): void;
  /** Stops whatever is being said. Safe to call when nothing is. */
  cancel(): void;
}

/**
 * How the guide sounds.
 *
 * Slower and lower than a default voice, because the guide is meant to be calm
 * and a browser's default cadence is a screen reader's. `en-CA` because Canada
 * is the first market and the guide should not sound imported.
 *
 * Deliberately **not** `LOCALE` from `@stillpoint/protocol`, which is the date
 * and number locale. They happen to be the same string and they are not the
 * same decision: this one is which voice a synthesiser picks, and Canada has
 * two official languages, so a French-speaking user is a reason for this to
 * become `fr-CA` while dates stay as they are. Coupling them now would hide
 * that.
 */
export const GUIDE_STYLE: SpeechStyle = { lang: 'en-CA', rate: 0.92, pitch: 0.95 };

/**
 * The guide, spoken by an engine.
 *
 * **What leaves the device.** Some engines synthesise locally and some send the
 * text away. What is sent is the protocol's copy — the question for the step —
 * which the server has already put on the screen, so this adds no disclosure.
 * It is **not** the user's own words, and the interface is now shaped so it
 * cannot be: `GuideCopy`'s only values are what the API returns as a session's
 * `say`. That sentence used to end "the interface is shaped so it cannot be"
 * while the parameter was a `string`, which made the name the guarantee.
 */
export function engineGuideVoice(
  engine: SpeechEngine | undefined,
  style: SpeechStyle = GUIDE_STYLE,
): GuideVoice {
  let speaking = false;

  const availability = (): Availability =>
    engine === undefined
      ? { available: false, reason: 'This browser cannot speak. You can type instead.' }
      : { available: true };

  return {
    id: 'speech-engine',
    availability,

    speak(protocolCopy: GuideCopy): Promise<void> {
      // A guide that cannot speak must not stall a session: resolve, and let
      // the screen carry the question as it already does.
      if (engine === undefined || protocolCopy.trim() === '') return Promise.resolve();

      // Clear whatever came before. Two questions overlapping would be worse
      // than silence.
      engine.cancel();
      speaking = true;

      return new Promise<void>((resolve) => {
        engine.speak(protocolCopy, style, () => {
          speaking = false;
          resolve();
        });
      });
    },

    stop(): void {
      if (engine === undefined || !speaking) return;
      speaking = false;
      engine.cancel();
    },
  };
}
