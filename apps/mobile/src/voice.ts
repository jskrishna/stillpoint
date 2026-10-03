/**
 * The guide's voice on a phone.
 *
 * Same seam as the web's (`apps/web/src/lib/voice`) and for the same reason:
 * the voice stack is not chosen, so nothing above this file knows what is
 * speaking. `expo-speech` is the system's text-to-speech — a stand-in that
 * proves the loop, not the product's voice. Replacing it means replacing this
 * file.
 *
 * Listening is not here. `expo-speech` speaks and does not hear, and there is
 * no first-party Expo speech-to-text; the turn-taking half of the loop waits
 * on the same vendor decision. `userEar` says so rather than pretending, and
 * the session screen falls back to typing, which is what the web does.
 */
import * as Speech from 'expo-speech';

/** Whether a half of the loop can run, and if not, why not in plain words. */
export interface Availability {
  readonly available: boolean;
  readonly reason: string | null;
}

export interface GuideVoice {
  /** Speaks, resolving when it has finished or been cut off. */
  readonly say: (text: string) => Promise<void>;
  /** Stops mid-sentence. Called when a session ends or the user leaves. */
  readonly hush: () => void;
  readonly availability: Availability;
}

export interface UserEar {
  readonly availability: Availability;
}

/**
 * How the guide sounds.
 *
 * Indian English, and slower than default: this is someone being talked
 * through six steps while upset, and the designs' pacing is unhurried. The
 * same numbers as the web's `GUIDE_STYLE`, so the two surfaces do not drift
 * into different voices.
 */
export const GUIDE_STYLE = { language: 'en-IN', rate: 0.92, pitch: 0.95 } as const;

/** A voice that says nothing, for the "text only" setting and for tests. */
export const silentGuide: GuideVoice = {
  say: () => Promise.resolve(),
  hush: () => undefined,
  availability: { available: false, reason: 'Set to text only.' },
};

export function systemGuideVoice(): GuideVoice {
  return {
    say: (text) =>
      new Promise<void>((resolve) => {
        if (text.trim() === '') {
          resolve();
          return;
        }
        Speech.speak(text, {
          language: GUIDE_STYLE.language,
          rate: GUIDE_STYLE.rate,
          pitch: GUIDE_STYLE.pitch,
          onDone: () => {
            resolve();
          },
          // A voice that fails to start must not hang the step: the words are
          // on the screen as well, and the session goes on without them.
          onStopped: () => {
            resolve();
          },
          onError: () => {
            resolve();
          },
        });
      }),
    hush: () => {
      void Speech.stop();
    },
    availability: { available: true, reason: null },
  };
}

/** Why the guide cannot listen yet. Shown to the user, so it is plain. */
export const NO_EAR_REASON =
  'Talking back is not ready yet — type what you want to say and the guide will follow.';

export const noEar: UserEar = {
  availability: { available: false, reason: NO_EAR_REASON },
};

export function guideVoiceFor(preference: string): GuideVoice {
  // The profile's `guideVoice` is the domain's setting; 'off' is the only one
  // that means silence, and anything else is a voice this stand-in cannot
  // actually distinguish between. It will when there is a real engine.
  return preference === 'off' ? silentGuide : systemGuideVoice();
}
