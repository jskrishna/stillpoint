import { ApiError } from '@stillpoint/client';

/**
 * A refusal, in words for the person reading it.
 *
 * Word for word the web app's, because the two surfaces answer to the same API
 * and someone who meets a limit on their phone and then on their laptop should
 * not be told two different things about it.
 *
 * `ApiError` comes from the package rather than from `./api` so this file
 * stays a pure function with no React Native behind it — which is what lets it
 * have a test.
 */
export function describe(e: unknown): string {
  if (e instanceof ApiError) {
    const first = Object.values(e.errors)[0]?.[0];
    if (first !== undefined) return first;
    if (e.status === 429) return rateLimited(e.message);

    return e.message;
  }

  return 'Could not reach Stillpoint. Check your connection and try again.';
}

/**
 * A 429 is two different things, and they do not get the same sentence.
 *
 * One is a sign-in throttle, where the API lets Laravel's middleware answer
 * and the body is the bare "Too Many Requests" — not something to show a
 * person, which is what the generic line below exists to replace.
 *
 * The other is the guide's budget running out **mid-session**, and there the
 * API sends its own sentence: "That was a lot of answers very quickly. Give it
 * a moment and try again." This used to throw that away and say "Too many
 * attempts" instead — to somebody upset, part-way through being asked
 * questions, in words that read as an accusation about a login form. The web
 * app showed the server's sentence, so the two surfaces told you different
 * things about the same limit, which is the one thing the note above this
 * promises they do not.
 *
 * So the server's own words win when it has any, and the generic is the
 * fallback it was always meant to be.
 */
function rateLimited(message: string): string {
  const own = message.trim();
  const framework = own === '' || /^too many requests\.?$/i.test(own);

  return framework ? 'Too many attempts. Wait a minute and try again.' : own;
}
