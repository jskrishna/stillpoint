import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * A built phone app is refused without somewhere to call.
 *
 * `apps/mobile/app.config.js` is what stands between `eas build` and an APK
 * that calls `localhost`. The address is inlined into the bundle when it is
 * built, its default is the developer's own machine, and an APK cannot be
 * patched after it has been handed to somebody: it would install, open, and
 * say "Could not reach Stillpoint" on every screen about a connection that is
 * fine. So the config throws instead, and these are its cases.
 *
 * It lives here, with the other checks on the phone's source, because
 * `apps/mobile` has no Node types to load a file with.
 */
const require = createRequire(import.meta.url);
const configure = require('../../../mobile/app.config.js') as (input: {
  config: { plugins?: unknown[] };
}) => { plugins?: unknown[] };

const base = { plugins: ['expo-router'] };

const build = (profile: string | undefined, api: string | undefined) => {
  if (profile === undefined) delete process.env['EAS_BUILD_PROFILE'];
  else process.env['EAS_BUILD_PROFILE'] = profile;
  if (api === undefined) delete process.env['EXPO_PUBLIC_API_URL'];
  else process.env['EXPO_PUBLIC_API_URL'] = api;

  return configure({ config: base });
};

describe('the phone app’s build config', () => {
  afterEach(() => {
    delete process.env['EAS_BUILD_PROFILE'];
    delete process.env['EXPO_PUBLIC_API_URL'];
  });

  it('leaves everything that is not an EAS build exactly as it was', () => {
    // `expo start`, and the web export the browser check drives, with no
    // address set: the default is right for both.
    expect(build(undefined, undefined)).toBe(base);
  });

  it.each([
    ['no address at all', undefined, /not set/],
    ['an empty one, which is what eas.json ships with', '', /not set/],
    ['localhost', 'http://localhost:8000/api', /is the phone itself/],
    ['loopback', 'http://127.0.0.1:8000/api', /is the phone itself/],
    ['an origin with no /api on it', 'https://api.example.com', /not an API address/],
  ])('refuses a preview build with %s', (_name, api, why) => {
    expect(() => build('preview', api)).toThrow(why);
  });

  it('allows plain HTTP in a preview build, and says so in the manifest', () => {
    // A laptop on the same network is the only API there is to test against,
    // and Android blocks cleartext in a release build unless told otherwise.
    const built = build('preview', 'http://192.168.1.20:8000/api');

    expect(built.plugins).toContainEqual([
      'expo-build-properties',
      { android: { usesCleartextTraffic: true } },
    ]);
    expect(built.plugins).toContain('expo-router');
  });

  it('refuses plain HTTP in a production build', () => {
    // Every request carries a bearer token.
    expect(() => build('production', 'http://192.168.1.20:8000/api')).toThrow(/plain HTTP/);
  });

  it('adds nothing for an https address, in either profile', () => {
    expect(build('preview', 'https://api.example.com/api')).toBe(base);
    expect(build('production', 'https://api.example.com/api')).toBe(base);
  });
});
