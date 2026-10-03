/**
 * Binding the voice loop for the browser.
 *
 * The one place a surface decides which implementations it runs with. Changing
 * the voice stack means changing this function and adding an adapter beside the
 * ones it chooses from — not touching a session screen.
 */

import { browserSpeechEngine } from './browser-engine';
import { engineGuideVoice, silentGuide } from './guide-voice';
import { noEar } from './user-ear';
import type { VoiceLoop } from './types';

export type { Availability, EarHandlers, GuideVoice, UserEar, VoiceLoop } from './types';
export {
  engineGuideVoice,
  silentGuide,
  GUIDE_STYLE,
  type SpeechEngine,
  type SpeechStyle,
} from './guide-voice';
export { browserSpeechEngine } from './browser-engine';
export { noEar, NO_EAR_REASON } from './user-ear';

/**
 * The loop for a given talk mode.
 *
 * `type` gets a silent guide: someone who chose to type did not ask to be read
 * to. The other two modes get the browser's synthesiser, which is the only
 * engine that exists — and `noEar` either way, because listening is not built.
 *
 * So a "hands free" session today is a typed session with a guide that speaks.
 * That is a truthful half of the mode rather than a pretence at all of it, and
 * the setup screen says as much.
 */
export function browserVoiceLoop(talkMode: string): VoiceLoop {
  return {
    guide: talkMode === 'type' ? silentGuide : engineGuideVoice(browserSpeechEngine()),
    ear: noEar,
  };
}
