import { describe, expect, it } from 'vitest';
import { ago, describeAge, exact } from './ago';

const NOW = Date.parse('2026-03-01T12:00:00.000Z');
const at = (ms: number) => new Date(NOW - ms).toISOString();

describe('ago', () => {
  it('reads as a short age', () => {
    expect(ago(at(0), NOW)).toBe('now');
    expect(ago(at(59_000), NOW)).toBe('now');
    expect(ago(at(12 * 60_000), NOW)).toBe('12m');
    expect(ago(at(5 * 3_600_000), NOW)).toBe('5h');
    expect(ago(at(3 * 86_400_000), NOW)).toBe('3d');
  });

  it('does not read as negative when the browser clock is behind', () => {
    // A queue that shows "-4m" looks broken, and the thing that is actually
    // wrong is the viewer's clock.
    expect(ago(at(-4 * 60_000), NOW)).toBe('now');
  });

  it('says so rather than guessing when there is no timestamp', () => {
    expect(ago(null, NOW)).toBe('—');
    expect(ago(undefined, NOW)).toBe('—');
    expect(ago('not a date', NOW)).toBe('—');
    expect(exact(null)).toBeUndefined();
  });
});

describe('describeAge', () => {
  it('reads as words, and is singular when it should be', () => {
    expect(describeAge(at(10 * 60_000), NOW)).toBe('less than an hour');
    expect(describeAge(at(3_600_000), NOW)).toBe('1 hour');
    expect(describeAge(at(5 * 3_600_000), NOW)).toBe('5 hours');
    expect(describeAge(at(86_400_000), NOW)).toBe('1 day');
    expect(describeAge(at(4 * 86_400_000), NOW)).toBe('4 days');
  });

  it('says unknown rather than inventing an age', () => {
    expect(describeAge(null, NOW)).toBe('unknown');
  });
});
