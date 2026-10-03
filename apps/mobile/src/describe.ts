import { ApiError } from './api';

/**
 * A refusal, in words for the person reading it.
 *
 * Word for word the web app's, because the two surfaces answer to the same API
 * and someone who meets a limit on their phone and then on their laptop should
 * not be told two different things about it.
 */
export function describe(e: unknown): string {
  if (e instanceof ApiError) {
    const first = Object.values(e.errors)[0]?.[0];
    if (first !== undefined) return first;
    if (e.status === 429) return 'Too many attempts. Wait a minute and try again.';
    return e.message;
  }
  return 'Could not reach Stillpoint. Check your connection and try again.';
}
