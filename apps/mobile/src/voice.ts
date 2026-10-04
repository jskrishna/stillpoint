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
import type { GuideCopy } from '@stillpoint/client';

/**
 * The line that previews a voice, which is the **only** guide copy that does
 * not come from a session.
 *
 * Named, and in one place, because the set of ways to make a `GuideCopy` is
 * the whole guarantee: every one of them has to be the product's own copy
 * rather than anything a person typed. This one is built from
 * `GUIDE_VOICES` — the protocol's own names and descriptions — on the setup
 * screen, so a listener can hear a voice before choosing it.
 *
 * It is also how the type earned its keep immediately: both seams said
 * `speak` "is only ever handed `session.say`", and this call had been there
 * the whole time. The sentence was wrong and nothing could tell, because the
 * parameter was a `string`.
 */
export function voicePreview(voice: { readonly name: string; readonly description: string }) {
  return `This is ${voice.name}. ${voice.description}.` as GuideCopy;
}

/** Whether a half of the loop can run, and if not, why not in plain words. */
export interface Availability {
  readonly available: boolean;
  readonly reason: string | null;
}

export interface GuideVoice {
  /**
   * Speaks, resolving when it has finished or been cut off.
   *
   * `GuideCopy`, not `string`: the only values of it are what the API returns
   * as a session's `say`, so the user's own answers cannot reach a synthesiser
   * without an explicit cast. `expo-speech` uses the platform's engine, and
   * whether that engine synthesises on the device or sends the text away is
   * the platform's business rather than ours — which is the reason this is a
   * type and not a comment. The web's seam has the same shape and the same
   * reasoning, in `apps/web/src/lib/voice/types.ts`.
   */
  readonly say: (text: GuideCopy) => Promise<void>;
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
 * Canadian English, and slower than default: this is someone being talked
 * through six steps while upset, and the designs' pacing is unhurried. The
 * same numbers as the web's `GUIDE_STYLE`, so the two surfaces do not drift
 * into different voices.
 *
 * Deliberately not `LOCALE` from `@stillpoint/protocol`, which is the date and
 * number locale. Same string today, different decision: this is which voice a
 * synthesiser picks, and Canada has two official languages — a French-speaking
 * user is a reason for this to become `fr-CA` while dates stay as they are.
 */
export const GUIDE_STYLE = { language: 'en-CA', rate: 0.92, pitch: 0.95 } as const;

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

/**
 * Why the guide cannot listen, in words for the person reading them.
 *
 * Word for word the web app's (`apps/web/src/lib/voice/user-ear.ts`). It is
 * one sentence about one unbuilt feature, and two surfaces describing it
 * differently is how someone ends up believing it works on their laptop.
 *
 * It stands alone wherever it is shown — no screen splices it into a longer
 * sentence, because the em-dash in it reads as a stammer when something else
 * is wrapped around it.
 */
export const NO_EAR_REASON =
  'Speaking is not ready yet — type what you want to say and the guide will follow.';

export const noEar: UserEar = {
  availability: { available: false, reason: NO_EAR_REASON },
};

export function guideVoiceFor(preference: string): GuideVoice {
  // The profile's `guideVoice` is the domain's setting; 'off' is the only one
  // that means silence, and anything else is a voice this stand-in cannot
  // actually distinguish between. It will when there is a real engine.
  return preference === 'off' ? silentGuide : systemGuideVoice();
}
