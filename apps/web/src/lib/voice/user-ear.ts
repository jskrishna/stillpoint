/**
 * Hearing the user — the half that is not built.
 *
 * Nothing is bound here, and that is a decision rather than an omission.
 *
 * Every option available today sends the user's audio somewhere. The browser's
 * own `SpeechRecognition` uploads it to the browser vendor in Chrome; every
 * hosted speech-to-text service uploads it by definition; an on-device model is
 * possible and is a real piece of work. The voice setup screen says **"Your
 * voice is never saved"**, and whose law applies is Canada's now that Canada
 * is the first market — PIPEDA federally, and Québec's Law 25, which is the
 * stricter of the two on consent. India's DPDP applies to the second market.
 * Nobody here has read any of them: naming them is a note about who has to be
 * asked, not advice.
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
/**
 * Why the guide cannot listen, in words for the person reading them.
 *
 * Word for word the mobile app's (`apps/mobile/src/voice.ts`). It is one
 * sentence about one unbuilt feature, and two surfaces describing it
 * differently is how someone ends up believing it works on their phone.
 *
 * It stands alone wherever it is shown — no screen splices it into a longer
 * sentence, because the em-dash in it reads as a stammer when something else
 * is wrapped around it.
 */
export const NO_EAR_REASON =
  'Speaking is not ready yet — type what you want to say and the guide will follow.';

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
