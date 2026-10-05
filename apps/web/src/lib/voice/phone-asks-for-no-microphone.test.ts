import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { noEar } from './user-ear';

/**
 * The phone does not ask for a microphone it does not use.
 *
 * Listening is not in v1: `UserEar` is unbound on both surfaces, the setup
 * screen says "Your voice is never saved", and this app's own
 * `Permissions-Policy` sends `microphone=()`. The phone's manifest said
 * otherwise. It declared Android's `RECORD_AUDIO`, and two iOS usage strings:
 * "Stillpoint listens while you talk through what happened" and "Stillpoint
 * turns what you say into text". So the store listing for an app that
 * promises never to ask would have shown a microphone permission, and a
 * reviewer or a user reading the permission prompt's text would have been
 * told about a feature the product decided not to have.
 *
 * Tied to `noEar` on purpose. The day a listener is bound these come back,
 * with a consent flow, and this test is what says the two have to move
 * together: it fails if the manifest asks while the ear is still unavailable.
 */
const manifest = readFileSync(
  fileURLToPath(new URL('../../../../mobile/app.json', import.meta.url)),
  'utf8',
);

describe('the phone app’s manifest', () => {
  it('asks for no microphone while nothing can listen', () => {
    // The premise, stated so this cannot pass by the ear having been bound.
    expect(noEar.availability().available).toBe(false);

    expect(manifest).not.toMatch(/RECORD_AUDIO/);
    expect(manifest).not.toMatch(/NSMicrophoneUsageDescription/);
    expect(manifest).not.toMatch(/NSSpeechRecognitionUsageDescription/);
  });

  it('is the manifest, and names the app', () => {
    // A check on a file that was not found, or was the wrong file, passes.
    expect(JSON.parse(manifest)).toMatchObject({ expo: { name: 'Stillpoint' } });
  });
});
