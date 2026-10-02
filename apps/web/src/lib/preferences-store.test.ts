import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@stillpoint/protocol';
import { browserPreferences } from './preferences-store.js';

/** A minimal localStorage, so the guards can be exercised in Node. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}

const KEY = 'stillpoint.preferences.v1';

beforeEach(() => {
  const storage = new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
});

describe('preferences', () => {
  it('starts at the defaults', () => {
    expect(browserPreferences.read()).toEqual(DEFAULT_PREFERENCES);
  });

  it('round-trips a change', () => {
    browserPreferences.write((p) => ({ ...p, voice: 'river' }));
    expect(browserPreferences.read().voice).toBe('river');
  });

  it('records consent', () => {
    browserPreferences.write((p) => ({ ...p, acceptedConsent: ['understands', 'adult'] }));
    expect(browserPreferences.read().acceptedConsent).toEqual(['understands', 'adult']);
  });

  it('treats unreadable storage as consent not given', () => {
    window.localStorage.setItem(KEY, 'not json at all');
    // Defaults mean "no consent recorded", which is the safe way to be wrong.
    expect(browserPreferences.read().acceptedConsent).toEqual([]);
  });

  it('drops values it does not recognise rather than trusting them', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        voice: 'shouty',
        talkMode: 'telepathy',
        acceptedConsent: ['understands', 'hacked'],
      }),
    );
    const prefs = browserPreferences.read();
    expect(prefs.voice).toBe(DEFAULT_PREFERENCES.voice);
    expect(prefs.talkMode).toBe(DEFAULT_PREFERENCES.talkMode);
    expect(prefs.acceptedConsent).toEqual(['understands']);
  });

  it('survives a stored value that is not an object', () => {
    window.localStorage.setItem(KEY, '"a string"');
    expect(browserPreferences.read()).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps coach sharing at ask-each-time unless explicitly changed', () => {
    expect(browserPreferences.read().coachSharing).toBe('ask_each_time');
    browserPreferences.write((p) => ({ ...p, coachSharing: 'never' }));
    expect(browserPreferences.read().coachSharing).toBe('never');
  });
});
