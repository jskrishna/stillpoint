import { ApiError } from '@stillpoint/client';

/**
 * A refusal, in words for the person reading it.
 *
 * **This file exists twice, once per surface, and the two must stay identical.**
 * `apps/web/src/lib/describe.ts` and `apps/mobile/src/describe.ts` are the same
 * function word for word: the two surfaces answer to the same API, and somebody
 * who meets a limit on their phone and then on their laptop should not be told
 * two different things about it. It is not in `packages/client`, which is
 * allowed I/O and not copy — a sentence shown to a person is the surface's.
 *
 * That promise was in this comment and had already stopped being true. The
 * phone had this; the web had a dozen hand-rolled versions, several of which
 * threw the server's own sentence away and blamed the network instead. So
 * `parity/refusals.json` is a checked-in table of refusals and the sentence
 * each one gets, and both surfaces' tests assert against it — a wording
 * changed on one surface and not the other turns one of them red.
 *
 * `ApiError` comes from the package rather than from the surface's own `api`
 * module so this stays a pure function with nothing environment-specific
 * behind it, which is what lets it have a test.
 */
export function describe(e: unknown): string {
  if (e instanceof ApiError) {
    const first = Object.values(e.errors)[0]?.[0];
    if (first !== undefined) return first;
    if (e.status === 429) return rateLimited(e.message);

    /*
     * A 5xx is the framework answering, which is the one case the rule above
     * is not for.
     *
     * Measured with `app.debug` off, which is what a deployment runs: Laravel
     * sends `{"message": "Server Error"}` for anything that is not an
     * `HttpException`. Those two words are not a sentence for a person, and
     * returning the server's message handed them straight to somebody
     * part-way through being asked why they are upset. (The thrown
     * exception's own message is not leaked — that part was checked.)
     *
     * It also does not get the sentence below. "Stillpoint would not do that"
     * describes a refusal the server declined to explain, which is the
     * `abort(404)` convention; a 500 is Stillpoint trying and breaking, so
     * nothing declined. "Reload to see where things stand" is wrong advice
     * for the same reason: the request failed, so nothing moved, and there is
     * nothing new to see.
     *
     * `parity/refusals.json` had a 500 case before this and it pinned the
     * wrong shape — an empty message, which a deployment never sends — and so
     * agreed with the wrong sentence. A case for a shape the hazard does not
     * take does not cover the hazard.
     */
    if (e.status >= 500) return serverBroke;

    const own = e.message.trim();
    if (own !== '') return own;

    /*
     * An answer with no words in it.
     *
     * `abort(404)` with no message — which is how `EnsureStaff` hides the
     * console and how `authorizePairing()` hides whose clients are whose —
     * sends `{"message": ""}`. Returning that handed a screen an empty string
     * as the explanation, so a coach whose client ended the pairing while they
     * were typing a note got a blank line where the reason should be. Measured
     * against the running API, not inferred.
     *
     * It is deliberately not the connection sentence: the connection was fine,
     * the server answered, and it declined to say why — which is itself the
     * rule (404 rather than 403, so these routes do not confirm their own
     * existence to someone who may not use them). Reloading is the thing that
     * actually helps, because it shows the state the refusal came from.
     */
    return 'Stillpoint would not do that. Reload to see where things stand.';
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
 * questions, in words that read as an accusation about a login form.
 *
 * So the server's own words win when it has any, and the generic is the
 * fallback it was always meant to be.
 */
/**
 * What a 5xx says.
 *
 * Named and used once, so the two surfaces cannot drift on it the way they
 * drifted on the whole function. It blames nobody, because nobody did
 * anything, and it says the one thing worth doing.
 */
const serverBroke =
  'Stillpoint ran into a problem on its side. Nothing you did caused it — try again in a moment.';

function rateLimited(message: string): string {
  const own = message.trim();
  const framework = own === '' || /^too many requests\.?$/i.test(own);

  return framework ? 'Too many attempts. Wait a minute and try again.' : own;
}
