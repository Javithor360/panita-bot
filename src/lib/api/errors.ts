/** Statuses worth retrying for idempotent calls: the request may not have reached the API, or it was overloaded. */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/**
 * A failed API call. `status` is 0 for failures without an HTTP answer (`code` is then `network` or
 * `timeout`); `code` is the API's error code, or `http_<status>` when the body was not the API's envelope.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Worth retrying when the call is idempotent. */
  get retryable() {
    return this.status === 0 || RETRYABLE_STATUSES.has(this.status);
  }

  /** The service is unavailable or failing, as opposed to rejecting this particular request. */
  get transient() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** True when `error` is an `ApiError` with that status (and, when given, that code). */
export const isApiError = (error: unknown, status: number, code?: string): error is ApiError =>
  error instanceof ApiError && error.status === status && (code === undefined || error.code === code);
