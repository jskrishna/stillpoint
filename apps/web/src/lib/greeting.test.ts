import { describe, expect, it } from 'vitest';
import { greeting, partOfDay } from './greeting.js';

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
