/**
 * Two rules about a control that is pressed twice before the first press has
 * been answered. Both are closures rather than React state, and that is the
 * whole finding.
 *
 * **A guard that reads a state variable cannot refuse a same-frame second
 * press.** The handler closes over the value from the render it was created
 * in, so `if (busy) return` reads the `false` it was built with however many
 * times it is called before React re-renders. Measured in a real browser,
 * three presses dispatched inside one `evaluate` so nothing could flush
 * between them:
 *
 *   - the phone's "Export everything", guarded `if (exporting) return` —
 *     **three** whole-journal reads;
 *   - the console's "Mark as reviewed", guarded `if (reviewing) return` —
 *     three `POST …/review`, `[200, 200, 200]`;
 *   - the console's **Publish**, guarded `if (publishing) return` — three
 *     `POST …/publish`, `[200, 500, 500]` (the 500 is sqlite's `database is
 *     locked` under concurrent write transactions; on MySQL the second and
 *     third are the 422 for a draft that is no longer open).
 *
 * Three separate `click()` calls a few milliseconds apart send **one**, which
 * is why every earlier measurement here said these were fixed: a CDP round
 * trip between presses is a React flush, and a real double-tap is not. The
 * repository's note that the web's Accept "sends one request … so this one was
 * never reachable from the screen" was measured that way and is about the
 * wrong thing.
 *
 * So the state stays — it is what the label and `aria-disabled` are drawn from
 * — and the refusal moves into a closure the handler can read now.
 */

/**
 * Refuses a press while one is still being answered.
 *
 * For a control whose press *settles* something: publish, review, export,
 * delete, accept. Held across renders with `useRef(inFlight()).current`.
 */
export function inFlight(): (run: () => Promise<void>) => Promise<void> {
  let running = false;

  return async (run) => {
    if (running) return;
    running = true;
    try {
      await run();
    } finally {
      running = false;
    }
  };
}

/**
 * Runs writes in the order they were asked for, refusing none.
 *
 * For a control that is a *choice* somebody can change their mind about — a
 * settings radio, the summary's rating — where each press is a `PATCH` and a
 * second press is a newer intention rather than a duplicate. Refusing it would
 * lose that intention with nothing on screen to say so, which is what the
 * web's `<select>`s get from the native `disabled` attribute and is wrong for
 * a pressable.
 *
 * Nothing ordered those writes, so whichever request *arrived* last decided
 * what the server held. Measured in the running export with the first
 * `PATCH /me` held for 2.5 seconds — somebody choosing "Share every session",
 * changing their mind, and tapping "Never share" last:
 *
 *     the screen now shows: Share every session
 *     the server holds:     coachSharing = "always"
 *
 * Their last choice was "Never share", and every session they finish from then
 * on goes to their coach. The screen agrees with the server, so there is
 * nothing to notice — on the setting whose whole job is to decide who may read
 * somebody's sessions. It is the *reassuring* direction of the two: taps the
 * other way round keep "Never share", so measuring one direction only would
 * have said this was fine.
 *
 * This is the console's stale-answer class with the arrow pushed one step
 * further in. There a superseded response only *displayed* the wrong rows;
 * here it is **written**, so a guard that merely ignores the stale answer
 * leaves the server holding it.
 *
 * Ordering at the source needs no stale guard after it: the responses then
 * arrive in press order, so the last one applied is the last one chosen. It
 * does **not** stop on a failure — a later press is a newer intention whether
 * or not an earlier one worked, and its answer is what the screen should end
 * up reporting.
 */
export function inOrder(): (write: () => Promise<void>) => Promise<void> {
  let last: Promise<unknown> = Promise.resolve();

  return (write) => {
    const next = last.then(write, write);
    last = next;

    return next;
  };
}
