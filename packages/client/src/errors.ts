import type { ApiHelpline } from './types.js';

/** A refusal from the API, with whatever the body said about why. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Laravel's field errors, when the failure was validation. */
    readonly errors: Record<string, string[]> = {},
    /** Anything else the body carried, e.g. which consent items are missing. */
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** The session has already ended; the client is behind. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /**
   * The helplines a refusal carried, or none.
   *
   * A turn into a session that has already ended is still read by the server
   * before it is refused, and a `high` answer comes back as a 409 with these
   * beside it: the session cannot be stopped a second time and the person
   * still has to be given a number. Read here so both session screens take
   * the same list the same way.
   */
  get helplines(): readonly ApiHelpline[] {
    const carried = this.body['helplines'];
    if (!Array.isArray(carried)) return [];

    return carried.filter(
      (h: unknown): h is ApiHelpline =>
        typeof h === 'object' &&
        h !== null &&
        typeof (h as Record<string, unknown>)['number'] === 'string' &&
        typeof (h as Record<string, unknown>)['name'] === 'string' &&
        typeof (h as Record<string, unknown>)['detail'] === 'string' &&
        typeof (h as Record<string, unknown>)['kind'] === 'string',
    );
  }
}
