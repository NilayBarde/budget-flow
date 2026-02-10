import type { PlaidPFC } from './categorizer.js';

export type TransactionType = 'income' | 'expense' | 'transfer' | 'investment' | 'return';

// Investment detection patterns (checked AFTER transfers)
export const INVESTMENT_PATTERNS = [
  /robinhood[- ]?debits?/i,
  /fidelity/i,
  /vanguard/i,
  /schwab/i,
  /etrade/i,
  /e-trade/i,
  /td\s*ameritrade/i,
  /coinbase/i,
  /webull/i,
  /acorns/i,
  /betterment/i,
];

// Transfer detection patterns
export const TRANSFER_PATTERNS = [
  /credit\s*card[- ]?auto[- ]?pay/i,
  /credit\s*card[- ]?payment/i,
  /card[- ]?payment/i,
  /payment.*thank\s*you/i,
  /autopay/i,
  /auto[- ]?pay/i,
  /credit\s*crd/i,
  /crd\s*autopay/i,
  /epayment/i,
  /e-payment/i,
  /\btransfer\b/i,
  /wire\s*transfer/i,
  /^payment$/i,
  /bill\s*pay/i,
  /billpay/i,
  /direct\s*debit/i,
  /loan\s*payment/i,
  /mortgage\s*payment/i,
  /\bpmt\b/i,
  /zelle/i,
  /cash\s*app/i,
  /acctverify/i,
  /account\s*verification/i,
  /bank\s*xfer/i,
  /mobile\s*pmt/i,
  /-ach\s*pmt/i,
  /money\s*out\s*cash/i,
  /money\s*in\s*cash/i,
  /\bfund\b.*money\s*(out|in)/i,
];

// Plaid categories that indicate transfers (legacy category field)
const TRANSFER_CATEGORIES = ['Transfer', 'Payment', 'Credit Card', 'Loan Payments'];

// Plaid personal_finance_category primary values that indicate transfers
const TRANSFER_PFC_PRIMARY = ['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'BANK_FEES'];

/**
 * Detect transaction type based on amount and patterns.
 *
 * Priority: transfers > investments > Plaid PFC > amount sign
 *
 * @param amount - Transaction amount (positive = expense, negative = money in)
 * @param texts - Array of text strings to check against patterns (merchant name, full name, description, etc.)
 * @param plaidPFC - Optional Plaid personal finance category
 * @param plaidCategories - Optional legacy Plaid category strings
 */
export const detectTransactionType = (
  amount: number,
  texts: string[],
  plaidPFC?: PlaidPFC | null,
  plaidCategories?: string[] | null,
): TransactionType => {
  // Check for TRANSFERS FIRST
  const matchesTransferPattern = texts.some((text) =>
    TRANSFER_PATTERNS.some((pattern) => pattern.test(text)),
  );
  if (matchesTransferPattern) return 'transfer';

  // Check for INVESTMENTS (after transfers ruled out)
  const matchesInvestmentPattern = texts.some((text) =>
    INVESTMENT_PATTERNS.some((pattern) => pattern.test(text)),
  );
  if (matchesInvestmentPattern) return 'investment';

  // Check Plaid's personal_finance_category
  const pfcPrimary = plaidPFC?.primary;
  const pfcDetailed = plaidPFC?.detailed;

  // Check if it's an investment based on Plaid's detailed category
  if (pfcDetailed?.includes('INVESTMENT') || pfcDetailed?.includes('RETIREMENT')) {
    return 'investment';
  }

  // Check if Plaid says it's a transfer
  if (pfcPrimary) {
    if (TRANSFER_PFC_PRIMARY.some((t) => pfcPrimary.startsWith(t.split('_')[0]))) {
      if (pfcPrimary.startsWith('TRANSFER') || pfcPrimary.startsWith('LOAN')) {
        return 'transfer';
      }
    }
    if (pfcPrimary === 'INCOME') {
      return 'income';
    }
  }

  // Check if Plaid legacy category indicates transfer
  const hasTransferCategory =
    plaidCategories?.some((cat) => TRANSFER_CATEGORIES.some((tc) => cat.includes(tc))) || false;
  if (hasTransferCategory) return 'transfer';

  // Negative amounts (money coming in)
  if (amount < 0) {
    if (pfcPrimary === 'INCOME') return 'income';
    return 'return';
  }

  return 'expense';
};
