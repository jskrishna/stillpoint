/**
 * The voice loop, as a seam.
 *
 * The voice stack is not chosen. Speech-to-text, text-to-speech and turn-taking
 * are three separate decisions with different vendors, costs and privacy
 * consequences, and `CLAUDE.md` asks for them to stay behind an interface so
 * the choice stays reversible.
 *
 * This is that interface. It lives in the surface and not in
 * `@stillpoint/protocol`, which must stay free of I/O: speech is the most
 * environment-specific thing the product does, and a browser, an Expo app and a
 * desktop shell will each bind something different behind these types.
 *
 * Two halves, deliberately separate:
 *
 *  - {@link GuideVoice} is the guide *speaking*. What it is given is the
 *    protocol's own copy, which the server has already decided to show on the
 *    screen, so saying it aloud reveals nothing the page does not.
 *  - {@link UserEar} is hearing the *user*. That is their own words, spoken when
 *    they are upset, and it is a different question entirely.
 *
 * Keeping them apart is the point: the guide can speak today while listening
 * waits on a decision, and neither is blocked on the other.
 */

import type { GuideCopy } from '@stillpoint/client';

/** Whether a piece of the loop can run here, and why not when it cannot. */
export type Availability =
  | { readonly available: true }
  | {
      readonly available: false;
      /** Shown to the user, so it says what they can do instead. */
      readonly reason: string;
    };

/**
 * The guide speaking.
 *
 * `speak` takes `GuideCopy` — the protocol's own copy, which is the question
 * for the current step or the safety pause's wording. **Never the user's own
 * words**: those are the most personal text the product holds, and reading
 * them back out to a third-party synthesiser is not a thing to do by accident.
 *
 * That used to be a sentence rather than a rule. The parameter was a `string`
 * named `protocolCopy`, so what stopped the accident was the name. `GuideCopy`
 * is a nominal type whose only values are what the API hands back as a
 * session's `say`, so a plain string needs a cast to get in here — and a cast
 * is conspicuous in a way a parameter name is not.
 */
export interface GuideVoice {
  /** Which implementation this is, for settings and for diagnostics. */
  readonly id: string;
  availability(): Availability;
  /**
   * Says `protocolCopy` aloud. Resolves when it has finished, or at once when
   * speech is unavailable — a guide that cannot speak must not stall a session.
   */
  speak(protocolCopy: GuideCopy): Promise<void>;
  /** Stops mid-sentence. Called when the user leaves or answers early. */
  stop(): void;
}

/** What a listener reports back while it runs. */
export interface EarHandlers {
  /** The best guess so far, for showing the user they are being heard. */
  readonly onPartial?: (text: string) => void;
  /** What the user said, once they have stopped. */
  readonly onFinal: (text: string) => void;
  readonly onError?: (reason: string) => void;
}

/** Hearing the user. Call the returned function to stop listening. */
export interface UserEar {
  readonly id: string;
  availability(): Availability;
  listen(handlers: EarHandlers): () => void;
}

/** Both halves, as a surface binds them. */
export interface VoiceLoop {
  readonly guide: GuideVoice;
  readonly ear: UserEar;
}
