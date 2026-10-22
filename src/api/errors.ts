// FR2: Typed error classes for Crossover API failures
// Spec 03 (error-envelope): optional envelope parameter carries CROS-XXXX
// errorCode, type, and human-readable text from the server.
// durable-data 01-auth-renewal FR3: synthetic error codes and the shared query
// retry predicate.

// ---------------------------------------------------------------------------
// Synthetic (client-side) error codes, carried in `errorCode`
// ---------------------------------------------------------------------------

/** First-response Tomcat HTML 5xx, mapped to AuthError(401) by handleStatus. */
export const AUTH_HTML_500 = 'AUTH_HTML_500';
/** getAuthToken refused locally: the same credentials were rejected < LOGIN_LATCH_MS ago. */
export const AUTH_LOGIN_LATCHED = 'AUTH_LOGIN_LATCHED';
/** A config exists but loadCredentials() returned null. */
export const NO_CREDENTIALS = 'NO_CREDENTIALS';
/** Still an HTML 5xx after a freshly minted token: a server outage, not an auth failure. */
export const HTML_5XX_AFTER_RENEWAL = 'HTML_5XX_AFTER_RENEWAL';

/** Query-level retry cap for `shouldRetryQuery` (matches today's `retry: 2`). */
export const MAX_QUERY_RETRIES = 2;

export type ErrorEnvelope = {
  errorCode?: string;
  type?: string;
  text?: string;
};

export class AuthError extends Error {
  statusCode: 401 | 403;
  errorCode?: string;
  serverText?: string;

  constructor(statusCode: 401 | 403, message?: string, envelope?: ErrorEnvelope) {
    super(message ?? `Authentication failed (${statusCode})`);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.errorCode = envelope?.errorCode;
    this.serverText = envelope?.text;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class ApiError extends Error {
  statusCode: number;
  errorCode?: string;
  errorType?: string;
  serverText?: string;

  constructor(statusCode: number, message?: string, envelope?: ErrorEnvelope) {
    super(message ?? `API error (${statusCode})`);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = envelope?.errorCode;
    this.errorType = envelope?.type;
    this.serverText = envelope?.text;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Thrown by `fetchAndBuildConfig` when the authenticated account has no
 * contributor (CANDIDATE) role and Hourglass cannot proceed with onboarding.
 *
 * Spec: features/app/resilience-fixes/specs/05-onboarding-defense (FR1).
 * Surfaced as a terminal onboarding screen at `app/(auth)/not-contributor.tsx`.
 */
export class NotContributorError extends Error {
  avatarTypes: string[];

  constructor(avatarTypes: string[]) {
    super(`Account has no contributor role (found: ${avatarTypes.join(', ')})`);
    this.name = 'NotContributorError';
    this.avatarTypes = avatarTypes;
    Object.setPrototypeOf(this, NotContributorError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Shared query retry predicate
// ---------------------------------------------------------------------------

/**
 * Whether a failure looks like an outage (retry) rather than a credential or
 * request problem (never retry).
 *
 * - AuthError: only the first-response HTML 5xx (`AUTH_HTML_500`). A real
 *   401/403, a latched login and missing credentials are not retried.
 * - NetworkError: always.
 * - ApiError: 5xx (including `HTML_5XX_AFTER_RENEWAL`), 408 and 429.
 * - Anything else (TypeError, unknown throws): retried.
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof AuthError) return err.errorCode === AUTH_HTML_500;
  if (err instanceof NetworkError) return true;
  if (err instanceof ApiError) {
    return err.statusCode >= 500 || err.statusCode === 408 || err.statusCode === 429;
  }
  return true;
}

/**
 * TanStack `retry` option: up to MAX_QUERY_RETRIES retries, and only for
 * retryable errors. TanStack v5 passes `failureCount` starting at 0.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryableError(error);
}
