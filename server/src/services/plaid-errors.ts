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
  response?: { data?: { error_code?: unknown; error_message?: unknown } };
}

/**
 * Make an error safe to log. An axios error holds the entire request, including the Plaid client
 * id and secret headers, so logging it raw writes credentials to the console. Those collapse to
 * "CODE: message". Every other error is returned untouched, so stack traces still show.
 */
export const redactError = (error: unknown): unknown => {
  if (typeof error !== 'object' || error === null || !(error as AxiosLikeError).isAxiosError) return error;
  const { code, message, response } = error as AxiosLikeError;
  const plaidMessage = response?.data?.error_message;
  return `${getPlaidErrorCode(error) ?? code ?? 'REQUEST_FAILED'}: ${typeof plaidMessage === 'string' ? plaidMessage : message}`;
};

// The user has to re-authenticate in Plaid Link (update mode) before the item syncs again.
// ITEM_NOT_FOUND is deliberately excluded: the item is gone, so update mode cannot fix it
// and the account has to be linked again from scratch.
export const needsReconnect = (errorCode: string | null): boolean =>
  errorCode === 'ITEM_LOGIN_REQUIRED';
