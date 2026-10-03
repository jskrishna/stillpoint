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
}
