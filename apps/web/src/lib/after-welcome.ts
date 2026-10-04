/**
 * Where to go when the welcome flow finishes, when it is not the home screen.
 *
 * There is one caller: the invitation screen. Somebody who follows a coach's
 * invitation while signed out has to sign in first, and before this they did
 * not come back. The screen pushed `/welcome?next=…` with a comment saying
 * "the invitation is in the URL, so it survives the trip", and **nothing read
 * that parameter** — sign-in pushed straight to consent or voice. Measured in
 * a real browser: the invitee registered, landed on `/welcome/consent`, and the
 * invitation was gone. That is the only path by which a coach gets a client,
 * and with no mail driver yet (`LAUNCH.md` item 2) the coach passes the link on
 * by hand, so most invitees meet it signed out.
 *
 * ## Why not `?next=`
 *
 * It is the conventional answer and it is the worse one here, for two
 * reasons.
 *
 * **It would be a redirect target anybody could write.** A link to
 * `/welcome?next=…` is a link somebody can send, and then the welcome flow is
 * a thing that signs you in and forwards you somewhere chosen by whoever sent
 * it. That needs validating, and validating a URL-shaped string is where the
 * desktop shell's navigation pin went wrong (see `apps/desktop/src/navigation.ts`).
 * Here the value is never in a URL at all: this module is the only writer, so
 * there is nothing for a link to plant.
 *
 * **And it would cost the static render.** Reading a search parameter means
 * `useSearchParams`, which on a prerendered route means a `Suspense` boundary
 * with a skeleton — `apps/web/src/app/session/page.tsx` has one and says why.
 * Three welcome screens would need one each, and every route here being
 * statically prerendered is load-bearing: it is the reason the content policy
 * can keep `'unsafe-inline'` instead of minting a per-request nonce.
 *
 * So it sits in `sessionStorage` and the end of the chain reads it. Sign-in and
 * consent do not change at all, which is the point — the destination is not
 * their business, it is just still there when the flow ends.
 *
 * ## What it does not do
 *
 * `sessionStorage` is per-tab, so opening the invitation in a new tab loses it
 * and the flow ends on the home screen, exactly as it does today. That is the
 * right way round for a convenience: missing means "the usual place", never an
 * error. It is also read-and-cleared, so an abandoned welcome does not surprise
 * somebody with a stale destination the next time they sign in.
 */

const KEY = 'stillpoint.after-welcome.v1';

/**
 * A path on this app, or `null`.
 *
 * Resolved by the URL parser against a base this app is not, and the origin
 * has to come back unchanged. That one comparison is the whole check, and it
 * is deliberately not a set of hand-rolled string guards — measured, the
 * parser treats all of these as another origin:
 *
 *     //evil.example       → http://evil.example
 *     /\evil.example       → http://evil.example   (a backslash is a slash)
 *     '  //evil.example'   → http://evil.example   (leading space is stripped)
 *     https://evil.example → https://evil.example
 *     javascript:alert(1)  → null
 *
 * A `startsWith('//')` check would have caught the first and missed the next
 * two. Let the parser decide.
 */
export function safePath(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  // Not this app's origin, and not reachable: if a value ever resolved here it
  // would mean the check had stopped working.
  const base = 'http://stillpoint.invalid';
  try {
    const url = new URL(raw, base);
    if (url.origin !== base) return null;

    // Normalised rather than echoed, so what the router is handed is what the
    // parser understood.
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Remembers where to go when the welcome flow finishes. */
export function rememberDestination(path: string): void {
  const safe = safePath(path);
  if (safe === null) return;

  try {
    window.sessionStorage.setItem(KEY, safe);
  } catch {
    // Private mode, blocked storage, a full quota. The flow ends on the home
    // screen, which is where it ended before this existed.
  }
}

/** Reads it and clears it, so it cannot linger into a later sign-in. */
export function takeDestination(): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);

    // Validated on the way out as well as in. Cheap, and the thing it guards
    // against — anything that can write this key — is the thing a one-sided
    // check assumes cannot happen.
    return safePath(raw);
  } catch {
    return null;
  }
}
