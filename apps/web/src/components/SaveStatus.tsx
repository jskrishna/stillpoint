/**
 * Whether what somebody typed has been saved, said out loud as well as drawn.
 *
 * Three screens save after typing stops — the step prompts an admin writes,
 * the note on a journal entry, a coach's private notes — and all three said
 * `· saving…` appended to their field's label and nothing else. Two things
 * were wrong with that, and the second is the one that cannot be seen.
 *
 * **There was never a "saved".** The only confirmation an edit had been
 * written was a word disappearing. Measured against the running API: the word
 * is on screen for as long as the request takes, which locally was under the
 * 400ms the measurement sampled at — so even sighted, on a fast connection,
 * there was nothing to see at all.
 *
 * **And it was in no live region**, so a screen reader was told neither the
 * attempt nor the result. The page had no `role="status"` anywhere.
 *
 * ## Why one component
 *
 * The words are not the subtle part; the mechanism is. A fourth screen with an
 * autosave would reach for the same `{saving ? '…' : ''}` and be wrong in the
 * same way, which is the argument that produced `lib/describe.ts` and
 * `lib/stale.ts`.
 *
 * ## Polite, and both words
 *
 * `role="status"` is polite — it waits for a pause rather than interrupting,
 * which is right here and the opposite of the session screen's crisis block,
 * where `role="alert"` is the point. A save is not news worth cutting across
 * somebody mid-sentence.
 *
 * Both words are in the one region rather than only the settled one. Announcing
 * just "saved" would be quieter, but "saving" is what tells somebody their edit
 * is in flight rather than lost, and the two together are one short phrase.
 * The debounce resets on every keystroke, so this fires once after a pause in
 * typing and not once per character.
 *
 * A failure is **not** here: each screen already shows the server's own
 * sentence through `describe()` in a `role="alert"`, which is the right
 * urgency for it and the wrong one for this.
 */

/** The three states a field can be in between keystrokes. */
export type SaveState = 'idle' | 'saving' | 'saved';

/**
 * The status, as a fragment to sit beside a field's label.
 *
 * Rendered even when idle, because a live region has to exist before it
 * changes: created already holding text, it announces nothing.
 */
export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <span role="status">
      {state === 'saving' ? ' · saving…' : state === 'saved' ? ' · saved' : ''}
    </span>
  );
}
