/**
 * The app's config, with two things `app.json` cannot say.
 *
 * `app.json` is still where the config lives. Expo hands it to this function,
 * and what comes back is what a build uses. Outside an EAS build this returns
 * it untouched, so `expo start` and the web export are exactly as they were.
 *
 * **A build with no API address is refused.** `EXPO_PUBLIC_API_URL` is
 * inlined into the bundle when it is built (see `src/api.ts`), and its default
 * is `localhost`, which on a phone is the phone. So an APK built without it
 * installs, opens, shows the welcome screen and can reach nothing, and every
 * screen says "Could not reach Stillpoint. Check your connection and try
 * again." about a connection that is fine. That is the failure this
 * repository keeps finding, in the one artefact that cannot be patched after
 * it is handed to somebody, so the build stops instead.
 *
 * **Plain `http://` is allowed in a preview build and nowhere else.** Android
 * refuses cleartext traffic in a release build unless the manifest allows it.
 * There is no deployed server yet, so the only API a test build can call is a
 * laptop on the same network, which is `http://`. A preview build pointed at
 * one gets the manifest flag; a production build pointed at one is refused,
 * because bearer tokens over plain HTTP are bearer tokens in public.
 */
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile === undefined || profile === '') return config;

  const api = process.env.EXPO_PUBLIC_API_URL ?? '';

  if (api === '') {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set, so this build would call localhost, which on a phone ' +
        `is the phone. Set it in eas.json, under build.${profile}.env, to the API's address ` +
        'ending in /api. A variable typed in front of `eas build` is not enough: the build ' +
        'runs on another machine, and eas.json is what goes with it.',
    );
  }

  if (!/^https?:\/\/[^/]+\/.*api$/.test(api)) {
    throw new Error(
      `EXPO_PUBLIC_API_URL is "${api}", which is not an API address this app can call. ` +
        'It is the origin and the path, ending in /api, like https://api.example.com/api.',
    );
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(api)) {
    throw new Error(
      `EXPO_PUBLIC_API_URL is "${api}". On a phone that address is the phone itself. ` +
        "Use the server's address, or this machine's address on the network.",
    );
  }

  const cleartext = api.startsWith('http://');

  if (cleartext && profile === 'production') {
    throw new Error(
      `EXPO_PUBLIC_API_URL is "${api}". A production build does not call an API over plain ` +
        'HTTP: every request carries a bearer token. Use an https:// address.',
    );
  }

  if (!cleartext) return config;

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ['expo-build-properties', { android: { usesCleartextTraffic: true } }],
    ],
  };
};
