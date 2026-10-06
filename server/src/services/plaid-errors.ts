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

/**
 * Make an error safe to log. An axios error holds the entire request, including the Plaid client
 * id and secret headers, so logging it raw writes credentials to the console. Those collapse to
 * "CODE: message". Every other error is returned untouched, so stack traces still show.
 */
export const redactError = (error: unknown): unknown => {
  if (isAxiosLike(error)) {
    const { code, message, response } = error;
    const plaidMessage = response?.data?.error_message;
    return `${getPlaidErrorCode(error) ?? code ?? 'REQUEST_FAILED'}: ${typeof plaidMessage === 'string' ? plaidMessage : message}`;
  }

  // An axios error can sit behind a wrapping Error's cause, and logging prints the cause in full.
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause !== undefined) {
    const redactedCause = redactError(cause);
    if (redactedCause !== cause) return `${(error as Error).message} (caused by ${redactedCause})`;
  }

  return error;
};

// The user has to re-authenticate in Plaid Link (update mode) before the item syncs again.
// ITEM_NOT_FOUND is deliberately excluded: the item is gone, so update mode cannot fix it
// and the account has to be linked again from scratch.
export const needsReconnect = (errorCode: string | null): boolean =>
  errorCode === 'ITEM_LOGIN_REQUIRED';
