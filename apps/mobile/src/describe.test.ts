import { describe as group, expect, it } from 'vitest';
import { ApiError } from '@stillpoint/client';
import { describe } from './describe';

const error = (status: number, message: string, errors = {}) =>
  new ApiError(message, status, errors);

group('describing a refusal', () => {
  it('prefers a field error, which is the most specific thing there is', () => {
    expect(describe(error(422, 'The given data was invalid.', { email: ['Already taken.'] }))).toBe(
      'Already taken.',
    );
  });

  it("keeps the server's own words on a 429", () => {
    // The guide's budget running out mid-session. The API writes this sentence
    // carefully, for somebody upset and part-way through being asked
    // questions; "Too many attempts" reads as an accusation about a login form.
    expect(
      describe(
        error(429, 'That was a lot of answers very quickly. Give it a moment and try again.'),
      ),
    ).toBe('That was a lot of answers very quickly. Give it a moment and try again.');
  });

  it('replaces the framework’s 429 body, which is what the generic is for', () => {
    // Laravel's throttle middleware answers the sign-in routes, and this is
    // what it says.
    expect(describe(error(429, 'Too Many Requests'))).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
    expect(describe(error(429, ''))).toBe('Too many attempts. Wait a minute and try again.');
  });

  it('passes other refusals through as the API worded them', () => {
    expect(describe(error(409, 'This session has ended.'))).toBe('This session has ended.');
  });

  it('says something about the connection when there was no answer at all', () => {
    expect(describe(new TypeError('Failed to fetch'))).toBe(
      'Could not reach Stillpoint. Check your connection and try again.',
    );
  });
});
