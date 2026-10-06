// Plaid API failures arrive as axios errors with the Plaid error body on response.data.
export const getPlaidErrorCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { response?: { data?: { error_code?: unknown } } }).response?.data?.error_code;
  return typeof code === 'string' ? code : null;
};

// The user has to re-authenticate in Plaid Link (update mode) before the item syncs again.
// ITEM_NOT_FOUND is deliberately excluded: the item is gone, so update mode cannot fix it
// and the account has to be linked again from scratch.
export const needsReconnect = (errorCode: string | null): boolean =>
  errorCode === 'ITEM_LOGIN_REQUIRED';
