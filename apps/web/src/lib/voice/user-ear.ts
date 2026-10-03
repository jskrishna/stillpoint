/**
 * Hearing the user — the half that is not built.
 *
 * Nothing is bound here, and that is a decision rather than an omission.
 *
 * Every option available today sends the user's audio somewhere. The browser's
 * own `SpeechRecognition` uploads it to the browser vendor in Chrome; every
 * hosted speech-to-text service uploads it by definition; an on-device model is
 * possible and is a real piece of work. The voice setup screen says **"Your
 * voice is never saved"**, and the product is India-first, which puts DPDP
 * consent in the frame too.
 *
 * So this reports itself unavailable, with a reason the screen can show, and
 * every session is typed. Binding a listener is a product and legal decision,
 * not a refactor — and when it is made, it goes behind {@link UserEar} and
 * nothing else changes.
 */

import type { UserEar } from './types';

/**
 * Why no listener is bound. Shown to the user, so it says what they can do.
 */
export const NO_EAR_REASON =
  'Speaking is not available yet — the voice stack is still being chosen. You can type instead.';

export const noEar: UserEar = {
  id: 'none',
  availability: () => ({ available: false, reason: NO_EAR_REASON }),
  listen: () => {
    // Nothing starts, so nothing needs stopping. Callers must check
    // `availability()` first; this returning a no-op means a caller that forgot
    // gets silence rather than an exception in the middle of a session.
    return () => undefined;
  },
};
