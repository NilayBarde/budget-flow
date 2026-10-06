// Plaid credentials and the sync cursor must never leave the server, whether in an API
// response or a downloadable export. Every route that returns an account row goes through here.
export const REDACTED_ACCOUNT_FIELDS = ['plaid_access_token', 'plaid_cursor'] as const;

type RedactedField = (typeof REDACTED_ACCOUNT_FIELDS)[number];

export const toPublicAccount = <T extends object>(account: T): Omit<T, RedactedField> => {
  const publicAccount = { ...account } as Record<string, unknown>;
  for (const field of REDACTED_ACCOUNT_FIELDS) delete publicAccount[field];
  return publicAccount as Omit<T, RedactedField>;
};
