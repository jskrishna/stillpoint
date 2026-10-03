/**
 * The API client, as this app uses it.
 *
 * The client itself is `@stillpoint/client`, shared with the web app, so the
 * paths and the field names cannot drift between the two. What belongs here is
 * only what is true of a phone: where the API is, and where the token is kept.
 *
 * ## Where the token is kept
 *
 * The keychain, through `expo-secure-store` — not `AsyncStorage`, which is a
 * plain file any process with the app's sandbox can read. This is a session
 * token for an account holding the most personal text the product has.
 *
 * The keychain is asynchronous and `TokenStore` is not, which is what
 * `cachedTokens` exists for: it holds the token in memory, answers from there,
 * and writes in the background. `restoreToken()` fills it once, behind the
 * splash screen, before the first screen decides whether to show sign-in.
 *
 * ## Web
 *
 * `expo-secure-store` has no web implementation and throws if called there.
 * The web target exists so this app can be previewed in a browser during
 * development, where `localStorage` is the same deliberate shortcut the web
 * app documents — it is not a surface anyone ships.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { cachedTokens, createClient } from '@stillpoint/client';

const KEY = 'stillpoint.token.v1';

/**
 * Where the API is.
 *
 * `EXPO_PUBLIC_*` is inlined into the bundle at build time, which is right for
 * a base URL and would be wrong for a secret. The default suits a simulator on
 * the same machine as `php artisan serve`; a real device needs the host's
 * address on the network, so `.env.example` says so.
 */
const env = process.env as Record<string, string | undefined>;
const BASE = env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:8000/api';

/**
 * `localStorage`, for the web preview only.
 *
 * Declared by hand rather than pulling the DOM lib into this project's types:
 * adding it would make every browser-only global look available on a phone,
 * which is how a call to one ends up shipping.
 */
interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function webStorage(): WebStorage | null {
  return (globalThis as { localStorage?: WebStorage }).localStorage ?? null;
}

async function persist(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    const store = webStorage();
    if (token === null) store?.removeItem(KEY);
    else store?.setItem(KEY, token);
    return;
  }
  if (token === null) await SecureStore.deleteItemAsync(KEY);
  else await SecureStore.setItemAsync(KEY, token);
}

function load(): Promise<string | null> {
  if (Platform.OS === 'web') return Promise.resolve(webStorage()?.getItem(KEY) ?? null);
  return SecureStore.getItemAsync(KEY);
}

const { store, hydrate } = cachedTokens(persist);

export const api = createClient({ baseUrl: BASE, tokens: store });

/**
 * Reads the stored token into memory.
 *
 * Awaited once, in the root layout, before anything renders. Until it has run,
 * `api.hasToken()` answers `false` — which is the safe way round: a moment of
 * sign-in is better than a moment of somebody's journal.
 */
export function restoreToken(): Promise<void> {
  return hydrate(load);
}

export { ApiError } from '@stillpoint/client';
export type * from '@stillpoint/client';
