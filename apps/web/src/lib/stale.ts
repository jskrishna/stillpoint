/**
 * Which answer a screen is allowed to believe, when it asked twice.
 *
 * A list screen fires a request when its filter changes. Nothing orders the
 * answers, so the first request can come back **after** the second, and the
 * last `setState` wins — which is the older one. Measured in a real browser
 * against the running API, with the first response held for 2.5 seconds:
 *
 * **The safety queue.** Pressed "Include reviewed" and then "Open only" again.
 * The filter button read "Include reviewed" (so the screen was offering to
 * include them, meaning it was showing open only), the count line read
 * `2 open · most severe first`, and one of the two rows was marked
 * **Reviewed**. A reviewer filtered to open work was shown finished work,
 * counted as open — on the screen whose whole purpose is deciding what still
 * needs following up, and in the flattering direction.
 *
 * **The accounts list.** Typed `zzzz-nobody` into the search box. The box held
 * that text and the screen listed `11 accounts · 1 admin`, all eleven rows:
 * every account in the product, under a search that matches none of them. That
 * is the screen where `admin` is granted, and granting it grants the safety
 * queue.
 *
 * Both are the shape this codebase keeps finding — a screen stating something
 * it has no evidence for. The difference from "a screen must not report an
 * absence it only failed to read" is only which way round it points: there a
 * failed request became "nothing"; here an answered-but-superseded request
 * becomes "this is what you asked for".
 *
 * ## The cursor half
 *
 * It is not only the rows. Each of those screens stores the page's
 * `nextCursor` beside its items, so a stale answer leaves the cursor pointing
 * into **the other ordering**. `cursorPaginate` encodes the ordering columns'
 * values and knows nothing about the filter, so the cursor is accepted and
 * "Load more" continues a different list from the one on screen. On the queue
 * that is the failure the root `CLAUDE.md` names where it explains why the
 * API pages by cursor at all: a reviewer never seeing a flag.
 *
 * ## Why a sequence and not an abort
 *
 * `AbortController` would be the tidier answer — it stops the server doing
 * work nobody wants — but `packages/client` takes no signal, and widening
 * every method's signature to thread one through is a larger change than the
 * bug. An abort also arrives at the call site as a rejection, so each one
 * would need distinguishing from a real failure or the screen would show a
 * connection error for a request it cancelled itself. By the time a stale
 * answer is here its cost is already paid; what is left is only the decision
 * whether to believe it.
 *
 * ## Why it is a module
 *
 * The core is a plain function and the hook is two lines around it, because
 * `vitest` here runs in `node` with no React renderer — the same reason
 * `apps/desktop/src/navigation.ts` is not inside `main.ts`. And it is shared
 * rather than written out twice because it is subtle enough that the second
 * screen already got it wrong: both of the ones above had the same omission,
 * and so would the third.
 */

import { useRef } from 'react';

/**
 * Hands out a token per request; only the newest one still answers `true`.
 *
 * Call the outer function as the request goes out and keep what it returns.
 * Ask that before touching state:
 *
 *     const current = guard();
 *     const page = await api.safetyFlags(status);
 *     if (!current()) return;
 *
 * The failure path needs it too. A stale rejection setting an error over a
 * newer page's rows is the same bug wearing the other face — the screen would
 * report a failure for a request whose replacement succeeded.
 */
export function staleGuard(): () => () => boolean {
  let issued = 0;

  return () => {
    issued += 1;
    const mine = issued;
    return () => mine === issued;
  };
}

/**
 * The same thing, surviving re-renders.
 *
 * Stable by identity, so it is safe in a dependency array — which matters,
 * because the screens that need it call it from an effect.
 */
export function useStaleGuard(): () => () => boolean {
  const held = useRef<(() => () => boolean) | null>(null);
  held.current ??= staleGuard();

  return held.current;
}
