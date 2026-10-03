import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow, Rectangle } from 'electron';

/**
 * Where the window was last time.
 *
 * Kept in the app's own data directory, and holding nothing but a rectangle:
 * no session, no token, nothing a person said. If this file is lost or
 * corrupt, the window opens at its default size, which is why every read is
 * guarded and none of them is an error worth showing anyone.
 */
export interface WindowState {
  readonly width: number;
  readonly height: number;
  readonly x?: number;
  readonly y?: number;
  readonly maximized: boolean;
}

/**
 * How big the window opens.
 *
 * Narrow, because the app surface is drawn to the phone design and nothing
 * else: `apps/web/src/app/app/app.module.css` caps its content column at
 * 430px. A 1280px window would open on a 430px column floating in an empty
 * field, which reads as a bug rather than as the unfinished design it is.
 *
 * This is a window size for the layout that exists, not a desktop layout —
 * inventing one of those would be inventing product visuals. When the designs
 * supply a desktop app layout, this grows with it.
 */
export const DEFAULT_STATE: WindowState = { width: 560, height: 880, maximized: false };

/** The content column plus its gutters. Below this the column starts to clip. */
export const MINIMUM = { width: 470, height: 600 };

function file(userData: string): string {
  return join(userData, 'window-state.json');
}

export function readState(userData: string): WindowState {
  try {
    const raw: unknown = JSON.parse(readFileSync(file(userData), 'utf8'));
    if (typeof raw !== 'object' || raw === null) return DEFAULT_STATE;
    const held = raw as Partial<WindowState>;

    const width = typeof held.width === 'number' ? held.width : DEFAULT_STATE.width;
    const height = typeof held.height === 'number' ? held.height : DEFAULT_STATE.height;

    return {
      // Clamped, not trusted: a monitor that has been unplugged since can
      // leave a size no display can show, and a window nobody can see is
      // indistinguishable from an app that will not start.
      width: Math.max(MINIMUM.width, width),
      height: Math.max(MINIMUM.height, height),
      ...(typeof held.x === 'number' ? { x: held.x } : {}),
      ...(typeof held.y === 'number' ? { y: held.y } : {}),
      maximized: held.maximized === true,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function writeState(userData: string, window: BrowserWindow): void {
  try {
    // `getNormalBounds` rather than `getBounds`: a maximized window's bounds
    // are the screen's, and restoring to those then un-maximizing would leave
    // the window filling the display with no way back to its old size.
    const bounds: Rectangle = window.getNormalBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: window.isMaximized(),
    };
    writeFileSync(file(userData), JSON.stringify(state), 'utf8');
  } catch {
    // Not being able to remember where the window was is not worth a dialog.
  }
}
