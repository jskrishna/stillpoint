import { describe, expect, it } from 'vitest';
import {
  CONSENT_ITEMS,
  COACH_SHARING_LABEL,
  DEFAULT_PREFERENCES,
  GUIDE_VOICES,
  REQUIRED_CONSENT,
  TALK_MODE_LABEL,
  hasRequiredConsent,
  missingConsent,
} from './onboarding.js';

describe('consent', () => {
  it('asks the three things the screen asks', () => {
    expect(CONSENT_ITEMS.map((i) => i.id)).toEqual(['understands', 'adult', 'improve']);
  });

  it('requires understanding and being an adult', () => {
    expect(REQUIRED_CONSENT).toEqual(['understands', 'adult']);
  });

  it('does not require the optional data item', () => {
    // Letting an unticked "improve the app" block someone would turn a choice
    // into a toll.
    expect(REQUIRED_CONSENT).not.toContain('improve');
    expect(hasRequiredConsent(['understands', 'adult'])).toBe(true);
  });

  it('blocks until both required items are accepted', () => {
    expect(hasRequiredConsent([])).toBe(false);
    expect(hasRequiredConsent(['understands'])).toBe(false);
    expect(hasRequiredConsent(['adult'])).toBe(false);
  });

  it('accepting only the optional item is not consent', () => {
    expect(hasRequiredConsent(['improve'])).toBe(false);
  });

  it('names what is still missing', () => {
    expect(missingConsent(['understands'])).toEqual(['adult']);
    expect(missingConsent(['understands', 'adult'])).toEqual([]);
  });

  it('states that this is not therapy somewhere in what is agreed', () => {
    expect(CONSENT_ITEMS.some((i) => i.text.includes('stop any time'))).toBe(true);
  });
});

describe('voices and modes', () => {
  it('offers the two voices the setup screen offers', () => {
    expect(GUIDE_VOICES.map((v) => v.name)).toEqual(['Sage', 'River']);
  });

  it('describes each voice', () => {
    for (const v of GUIDE_VOICES) expect(v.description).not.toBe('');
  });

  it('treats typing as a mode of its own, not an error state', () => {
    expect(TALK_MODE_LABEL.type).toBe('Type instead');
    expect(Object.keys(TALK_MODE_LABEL)).toHaveLength(3);
  });

  it('names every coach sharing choice', () => {
    expect(Object.keys(COACH_SHARING_LABEL)).toEqual(['ask_each_time', 'never', 'always']);
  });
});

describe('defaults', () => {
  it('starts with no consent accepted', () => {
    expect(DEFAULT_PREFERENCES.acceptedConsent).toEqual([]);
    expect(hasRequiredConsent(DEFAULT_PREFERENCES.acceptedConsent)).toBe(false);
  });

  it('defaults coach sharing to asking each time', () => {
    expect(DEFAULT_PREFERENCES.coachSharing).toBe('ask_each_time');
  });

  it('defaults to Sage and hold-to-talk, as the designs show', () => {
    expect(DEFAULT_PREFERENCES.voice).toBe('sage');
    expect(DEFAULT_PREFERENCES.talkMode).toBe('hold');
  });
});
