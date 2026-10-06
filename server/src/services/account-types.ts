// Account types are free text (Plaid subtypes or the user's own label), so every check is a
// case insensitive substring match. Keep each list here so routes agree on what an account is.

// Accounts whose balance counts as an investment for net worth.
const INVESTMENT_ACCOUNT_TYPES = [
  'investment',
  'brokerage',
  '401k',
  '401a',
  '403b',
  'ira',
  'roth',
  'roth 401k',
  'pension',
  'retirement',
  'stock plan',
  'crypto exchange',
];

// Accounts that hold invested funds and report their balance through Plaid's investments
// product. An HSA and a 529 belong here but are deliberately not net worth investments:
// the HSA is tracked as cash.
const HOLDINGS_ACCOUNT_TYPES = [...INVESTMENT_ACCOUNT_TYPES, 'hsa', '529'];

const matchesAny = (types: string[]) => (accountType?: string | null): boolean => {
  const normalized = (accountType || '').toLowerCase();
  return types.some(type => normalized.includes(type));
};

export const isInvestmentAccountType = matchesAny(INVESTMENT_ACCOUNT_TYPES);
export const isHoldingsAccountType = matchesAny(HOLDINGS_ACCOUNT_TYPES);
