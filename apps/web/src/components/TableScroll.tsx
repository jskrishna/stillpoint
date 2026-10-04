/**
 * A wrapper that lets a wide table scroll without dragging the page sideways.
 *
 * The console's three table screens and the coach portal all scrolled the
 * **document** at a phone's width. Measured, every route at 390 and 1440:
 * `/admin` over by 25px, `/admin/safety` by 34px, `/coach` by 67px, and
 * `/admin/users` by **284px**. The tables are `width: 100%`, which cannot
 * shrink below their content's minimum, so they pushed past the viewport and
 * took the heading and the navigation with them.
 *
 * `e2e/a11y.mjs` audits those routes at 390 and was clean, which is the point
 * worth keeping: a page that scrolls sideways breaks no axe rule. It is the
 * same shape as a screen with no live region being a perfectly valid page —
 * only wrong once you ask what the screen is for. Somebody checking the safety
 * queue from a phone is the case this is about, and the overview reporting how
 * long the oldest open flag has waited implies somebody checks it with some
 * urgency.
 *
 * ## What this is not
 *
 * It is **not** a responsive redesign. Stacking a table into cards at narrow
 * width is a design decision and the artifacts give no narrow layout for these
 * screens — inventing one is the same mistake as inventing step copy. The
 * desktop layout is untouched; at a width where the table fits, this box does
 * nothing at all.
 *
 * ## Why it is focusable
 *
 * A box with `overflow-x: auto` can be scrolled by touch and by a trackpad and
 * **not** by a keyboard, unless it can take focus. So `tabIndex={0}` with
 * `role="region"` and a name, which is what the WAI recommends for a
 * scrollable region — otherwise this trades a page that scrolls sideways for a
 * table a keyboard user cannot reach the right-hand end of. The cost is one
 * tab stop per table on every width, including the ones where nothing
 * scrolls; making it conditional means measuring overflow in JavaScript on
 * every resize, which is more machinery than the problem.
 *
 * One component rather than six wrappers, for the reason `SaveStatus` is one:
 * the `overflow-x` is not the subtle part, the ARIA is, and a seventh table
 * would reach for the `div` and forget it.
 */

import type { ReactNode } from 'react';
import styles from './TableScroll.module.css';

export function TableScroll({
  label,
  children,
}: {
  /** Names the region, so a screen reader says what it has landed in. */
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.scroll} tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}
