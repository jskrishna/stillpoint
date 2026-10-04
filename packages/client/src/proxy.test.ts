/**
 * A refusal that did not come from this application.
 *
 * The deployment is nginx in front of PHP-FPM, and nginx answers 502, 504 and
 * 413 with an **HTML** page. `request()` parsed every body with `JSON.parse`
 * before it looked at the status, so that threw a `SyntaxError` and no
 * `ApiError` was ever constructed.
 *
 * Measured before the fix: 502, 504 and 413 each arrived at the screen as a
 * `SyntaxError`. Which meant `describe()` said "Could not reach Stillpoint.
 * Check your connection and try again." about a server that had answered, and
 * every status-based branch was unreachable — the 5xx sentence added the same
 * day, `isUnauthenticated`, `isConflict`. PHP-FPM restarting is a deploy, so a
 * 502 is the ordinary case rather than an exotic one.
 *
 * The other half is the decision not to swallow a bad **success**: a 200 whose
 * body is not JSON is this application misconfigured, and returning an empty
 * object would make the journal say "Nothing yet" rather than that it could
 * not read. That is the absence class, and a throw is the honest answer.
 */

import { describe as group, expect, it } from 'vitest';
import { createClient } from './index.js';
import { ApiError } from './errors.js';
import { memoryTokens } from './tokens.js';
import type { Fetch } from './http.js';

/** nginx's own error page, near enough for this. */
function proxyPage(status: number, statusText: string): string {
  return [
    '<html>',
    `<head><title>${String(status)} ${statusText}</title></head>`,
    '<body>',
    `<center><h1>${String(status)} ${statusText}</h1></center>`,
    '<hr><center>nginx</center>',
    '</body>',
    '</html>',
  ].join('\r\n');
}

function clientAnswering(status: number, statusText: string, body: string) {
  const fetch: Fetch = () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      text: () => Promise.resolve(body),
    });

  return createClient({ baseUrl: 'https://api.test/api', tokens: memoryTokens('t'), fetch });
}

group('a refusal from something that is not this application', () => {
  for (const [status, statusText] of [
    [502, 'Bad Gateway'],
    [504, 'Gateway Time-out'],
    [413, 'Request Entity Too Large'],
  ] as const) {
    it(`${String(status)} comes through as an ApiError, not a parse error`, async () => {
      const api = clientAnswering(status, statusText, proxyPage(status, statusText));

      const thrown: unknown = await api.me().catch((e: unknown) => e);

      expect(thrown).toBeInstanceOf(ApiError);
      expect((thrown as ApiError).status).toBe(status);
      // The status is what a screen branches on, and the proxy's own words are
      // what `describe()`'s 5xx branch then replaces.
      expect((thrown as ApiError).message).toBe(statusText);
    });
  }

  it('and an empty body is still an ApiError with its status', async () => {
    const api = clientAnswering(503, 'Service Unavailable', '');

    const thrown: unknown = await api.me().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(503);
  });

  it("keeps the application's own message when there is one", async () => {
    const api = clientAnswering(
      409,
      'Conflict',
      JSON.stringify({ message: 'This session has ended.' }),
    );

    const thrown: unknown = await api.me().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).message).toBe('This session has ended.');
    expect((thrown as ApiError).isConflict).toBe(true);
  });

  /**
   * The half that is deliberately *not* forgiving.
   *
   * Swallowing this would hand a screen `{}` and the screen would report an
   * absence it had only failed to read.
   */
  it('still throws for a success whose body is not JSON', async () => {
    const api = clientAnswering(200, 'OK', proxyPage(200, 'OK'));

    const thrown: unknown = await api.me().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(SyntaxError);
    expect(thrown).not.toBeInstanceOf(ApiError);
  });
});
