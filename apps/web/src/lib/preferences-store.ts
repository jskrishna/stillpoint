/**
 * Where a user's choices live, for now.
 *
 * Same stand-in as the journal: this browser only, behind an interface, until
 * the storage decision is made. Consent is recorded here too, which is the part
 * that will have to move first — an agreement that exists only in one browser's
 * local storage is not a record anyone could rely on.
 */

import { DEFAULT_PREFERENCES, type Preferences } from '@stillpoint/protocol';

const KEY = 'stillpoint.preferences.v1';

export interface PreferencesStore {
  read(): Preferences;
  write(change: (current: Preferences) => Preferences): Preferences;
}

/** Narrows stored JSON back to Preferences, falling back field by field. */
function coerce(value: unknown): Preferences {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFERENCES;
  const raw = value as Partial<Record<keyof Preferences, unknown>>;

  return {
    voice: raw.voice === 'river' ? 'river' : DEFAULT_PREFERENCES.voice,
    talkMode:
      raw.talkMode === 'hands_free' || raw.talkMode === 'type'
        ? raw.talkMode
        : DEFAULT_PREFERENCES.talkMode,
    coachSharing:
      raw.coachSharing === 'never' || raw.coachSharing === 'always'
        ? raw.coachSharing
        : DEFAULT_PREFERENCES.coachSharing,
    acceptedConsent: Array.isArray(raw.acceptedConsent)
      ? raw.acceptedConsent.filter(
          (id): id is Preferences['acceptedConsent'][number] =>
            id === 'understands' || id === 'adult' || id === 'improve',
        )
      : [],
  };
}

export const browserPreferences: PreferencesStore = {
  read() {
    if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw === null ? DEFAULT_PREFERENCES : coerce(JSON.parse(raw));
    } catch {
      // Blocked, private window, or written by another version. Defaults mean
      // consent reads as not given, which is the safe way to be wrong.
      return DEFAULT_PREFERENCES;
    }
  },

  write(change) {
    const next = change(this.read());
    if (typeof window === 'undefined') return next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Nothing to do but carry on with the value in memory.
    }
    return next;
  },
};
