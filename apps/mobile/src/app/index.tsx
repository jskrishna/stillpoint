import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ApiError, api } from '../api';
import { Waiting } from '../ui';

/**
 * Where the app opens.
 *
 * Three answers, in order: no token means sign in; a token with the required
 * consent missing means consent; otherwise the app. The *server* decides which
 * consent is required (`hasRequiredConsent`), not this screen — a client that
 * decided for itself could be built to skip it.
 *
 * A token that turns out to be stale is dropped here rather than being carried
 * into a screen that would 401 on its first request.
 */
export default function Gate() {
  const [to, setTo] = useState<'welcome' | 'consent' | 'app' | null>(null);

  useEffect(() => {
    if (!api.hasToken()) {
      setTo('welcome');
      return;
    }

    void api
      .me()
      .then((profile) => {
        setTo(profile.hasRequiredConsent ? 'app' : 'consent');
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          api.storeToken(null);
          setTo('welcome');
          return;
        }
        // Not refused, only not answered: no signal, a restart, a rate limit.
        // The token is still good as far as anybody knows, so this is still a
        // signed-in person, and sending them to the sign-in form told them
        // they were not, with no reason given and no way back but to sign in
        // again. Every screen in the app handles its own failed read and its
        // own 401, and the server is what gates a session on consent.
        setTo('app');
      });
  }, []);

  if (to === null) return <Waiting what="Opening Stillpoint…" />;
  if (to === 'welcome') return <Redirect href="/welcome" />;
  if (to === 'consent') return <Redirect href="/welcome/consent" />;
  return <Redirect href="/(tabs)" />;
}
