/**
 * The colour each feeling carries.
 *
 * Feelings themselves are domain — their ids and labels live in
 * `@stillpoint/protocol`. Their colours are presentation, so they live here,
 * and every surface renders a given feeling identically: the chips at step 3,
 * the journal, the insights.
 *
 * Muted and earthy, never neon. A user's history should look like theirs.
 */

import { FEELINGS, type FeelingId } from '@stillpoint/protocol';
import type { Hex } from './color.js';

/** Colour per feeling. Exhaustive: every id in the protocol has an entry. */
export const FEELING_COLOR: Readonly<Record<FeelingId, Hex>> = {
  angry: '#B8553E',
  afraid: '#5D6F96',
  anxious: '#8A8FB0',
  sad: '#45627E',
  guilty: '#7A6454',
  humiliated: '#8E5C7E',
  rejected: '#A8704F',
  unworthy: '#8B7447',
  powerless: '#66607A',
  lonely: '#4F7A7E',
  overwhelmed: '#9C8440',
  hurt: '#A15B5B',
};

/** Returns the colour for a feeling. */
export function feelingColor(id: FeelingId): Hex {
  return FEELING_COLOR[id];
}

/** The feelings paired with their colours, in protocol order. */
export const FEELING_SWATCHES: readonly { id: FeelingId; label: string; color: Hex }[] =
  FEELINGS.map((f) => ({ id: f.id, label: f.label, color: FEELING_COLOR[f.id] }));
