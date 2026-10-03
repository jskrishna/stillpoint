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
        if (e instanceof ApiError && e.isUnauthenticated) api.storeToken(null);
        setTo('welcome');
      });
  }, []);

  if (to === null) return <Waiting what="Opening Stillpoint…" />;
  if (to === 'welcome') return <Redirect href="/welcome" />;
  if (to === 'consent') return <Redirect href="/welcome/consent" />;
  return <Redirect href="/(tabs)" />;
}
