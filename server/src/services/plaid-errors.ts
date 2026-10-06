// Plaid API failures arrive as axios errors with the Plaid error body on response.data.
export const getPlaidErrorCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { response?: { data?: { error_code?: unknown } } }).response?.data?.error_code;
  return typeof code === 'string' ? code : null;
};

interface AxiosLikeError {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  config?: unknown;
  response?: { data?: { error_code?: unknown; error_message?: unknown }; config?: unknown };
}

// Anything carrying the request config holds the credentials, whether or not the axios flag
// survived re-wrapping or came from a second copy of axios.
const isAxiosLike = (error: unknown): error is AxiosLikeError => {
  if (typeof error !== 'object' || error === null) return false;
  const { isAxiosError, config, response } = error as AxiosLikeError;
  return isAxiosError === true || (typeof config === 'object' && config !== null) || (typeof response?.config === 'object' && response.config !== null);
};

// PostgREST (Supabase) errors carry code, message, details and hint. On a constraint violation
// `details` holds "Failing row contains (...)", which would print the credential columns.
const isDatabaseError = (error: unknown): error is { code?: unknown; message?: unknown } =>
  typeof error === 'object' && error !== null && !(error instanceof Error) && 'details' in error && 'hint' in error;

// A cause chain can loop back on itself, so recursion stops here.
const MAX_DEPTH = 5;

const redact = (error: unknown, depth: number): unknown => {
  if (depth > MAX_DEPTH) return '[error chain too deep]';

  if (isAxiosLike(error)) {
    const { code, message, response } = error;
    const plaidMessage = response?.data?.error_message;
    return `${getPlaidErrorCode(error) ?? code ?? 'REQUEST_FAILED'}: ${typeof plaidMessage === 'string' ? plaidMessage : message}`;
  }

  if (isDatabaseError(error)) return `${error.code ?? 'DB_ERROR'}: ${error.message}`;

  if (!(error instanceof Error)) return error;

  // An axios error can sit behind a wrapping Error's cause, or inside an AggregateError, and
  // logging prints those in full. Only report the parts that needed redacting.
  const inner = [error.cause, ...((error as { errors?: unknown[] }).errors ?? [])].filter(e => e !== undefined);
  const redactedParts = inner
    .map(e => ({ original: e, redacted: redact(e, depth + 1) }))
    .filter(({ original, redacted }) => redacted !== original)
    .map(({ redacted }) => String(redacted));

  return redactedParts.length > 0 ? `${error.message} (${redactedParts.join('; ')})` : error;
};

/**
 * Make an error safe to log. An axios error holds the entire request, including the Plaid client
 * id and secret headers, and a database error can include a failing row, so logging either raw
 * can write credentials to the console. Those collapse to "CODE: message". Every other error is
 * returned untouched, so stack traces still show.
 */
export const redactError = (error: unknown): unknown => redact(error, 0);

// The user has to re-authenticate in Plaid Link (update mode) before the item syncs again.
// ITEM_NOT_FOUND is deliberately excluded: the item is gone, so update mode cannot fix it
// and the account has to be linked again from scratch.
export const needsReconnect = (errorCode: string | null): boolean =>
  errorCode === 'ITEM_LOGIN_REQUIRED';
