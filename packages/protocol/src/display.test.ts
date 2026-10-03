import { describe, expect, it } from 'vitest';
import { duration, greeting, partOfDay, relativeDay } from './display.js';

const NOW = new Date(2026, 9, 2, 12, 0, 0); // Friday 2 Oct 2026
const daysBefore = (n: number, hour = 9) => new Date(2026, 9, 2 - n, hour, 0, 0);

describe('relativeDay', () => {
  it('calls the same day Today, whatever the hour', () => {
    expect(relativeDay(daysBefore(0, 1), NOW)).toBe('Today');
    expect(relativeDay(daysBefore(0, 23), NOW)).toBe('Today');
  });

  it('names yesterday', () => {
    expect(relativeDay(daysBefore(1), NOW)).toBe('Yesterday');
  });

  it('uses the weekday within the last week', () => {
    expect(relativeDay(daysBefore(3), NOW)).toBe('Tuesday');
    expect(relativeDay(daysBefore(6), NOW)).toBe('Saturday');
  });

  it('falls back to a date beyond a week', () => {
    expect(relativeDay(daysBefore(8), NOW)).toMatch(/Sep/);
  });

  it('does not call a future entry anything but Today', () => {
    expect(relativeDay(new Date(2026, 9, 2, 23, 0, 0), NOW)).toBe('Today');
  });
});

describe('duration', () => {
  it('writes minutes as the journal does', () => {
    expect(duration(14)).toBe('14 min');
  });

  it('rounds to whole minutes', () => {
    expect(duration(13.6)).toBe('14 min');
  });

  it('never shows a zero-minute session', () => {
    expect(duration(0)).toBe('1 min');
    expect(duration(0.2)).toBe('1 min');
  });
});

const at = (hour: number) => new Date(2026, 9, 2, hour, 0, 0);

describe('partOfDay', () => {
  it('splits the day into morning, afternoon and evening', () => {
    expect(partOfDay(0)).toBe('morning');
    expect(partOfDay(11)).toBe('morning');
    expect(partOfDay(12)).toBe('afternoon');
    expect(partOfDay(16)).toBe('afternoon');
    expect(partOfDay(17)).toBe('evening');
    expect(partOfDay(23)).toBe('evening');
  });
});

describe('greeting', () => {
  it('greets by name when one is known', () => {
    expect(greeting(at(19), 'Aarav')).toBe('Good evening, Aarav');
  });

  it('greets without a name when none is', () => {
    expect(greeting(at(9))).toBe('Good morning');
  });

  it('treats a blank name as no name', () => {
    expect(greeting(at(9), '   ')).toBe('Good morning');
  });

  it('trims a name rather than greeting into whitespace', () => {
    expect(greeting(at(13), '  Aarav ')).toBe('Good afternoon, Aarav');
  });
});
