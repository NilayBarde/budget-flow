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

// Wording used when paying a bill to a merchant (utility, phone, insurance). Plaid's
// spending category is more reliable than these, so they yield to it. Every other
// transfer pattern (card payments, autopay, Zelle, ACH pmt, ...) describes money moving
// between accounts, and Plaid sometimes mislabels those (e.g. a "Bilt Card - PMT" card
// payment comes back as RENT_AND_UTILITIES), so those keep winning over Plaid.
const BILL_PAY_PATTERNS = [/bill\s*pay/i, /billpay/i, /direct\s*debit/i];

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
  ...BILL_PAY_PATTERNS,
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

// Plaid PFC primaries that unambiguously describe spending. When Plaid reports one of
// these, bill-pay wording must not reclassify the row (e.g. "CONED BILL PAYMENT" is a
// utility bill, not a transfer). Vague primaries (OTHER, TRANSFER_*, LOAN_PAYMENTS,
// BANK_FEES, INCOME) are deliberately excluded and still go through the patterns.
// Card payment and other account-to-account patterns still win over these categories.
// Only the bill-pay patterns are skipped when a spending category is present.
export const SPENDING_PFC_PRIMARY = [
  'FOOD_AND_DRINK',
  'GENERAL_MERCHANDISE',
  'TRANSPORTATION',
  'ENTERTAINMENT',
  'GENERAL_SERVICES',
  'TRAVEL',
  'RENT_AND_UTILITIES',
  'MEDICAL',
  'PERSONAL_CARE',
  'GOVERNMENT_AND_NON_PROFIT',
  'HOME_IMPROVEMENT',
];

const isCreditCardAccount = (accountType?: string | null): boolean =>
  Boolean(accountType && /credit/i.test(accountType));

/**
 * Detect transaction type based on amount and patterns.
 *
 * Priority: transfers (bill-pay wording yields to a Plaid spending category) > investments >
 * Plaid PFC > amount sign
 *
 * @param amount - Transaction amount (positive = expense, negative = money in)
 * @param texts - Array of text strings to check against patterns (merchant name, full name, description, etc.)
 * @param plaidPFC - Optional Plaid personal finance category
 * @param plaidCategories - Optional legacy Plaid category strings
 * @param accountType - Optional type of the account the transaction belongs to
 */
export const detectTransactionType = (
  amount: number,
  texts: string[],
  plaidPFC?: PlaidPFC | null,
  plaidCategories?: string[] | null,
  accountType?: string | null,
): TransactionType => {
  const hasSpendingCategory = Boolean(
    plaidPFC?.primary && SPENDING_PFC_PRIMARY.includes(plaidPFC.primary),
  );
  const transferPatterns = hasSpendingCategory
    ? TRANSFER_PATTERNS.filter((pattern) => !BILL_PAY_PATTERNS.includes(pattern))
    : TRANSFER_PATTERNS;

  // Check for TRANSFERS before investments
  const matchesTransferPattern = texts.some((text) =>
    transferPatterns.some((pattern) => pattern.test(text)),
  );
  if (matchesTransferPattern) return 'transfer';

  // Plaid says it's spending and nothing says money moved between accounts. Money coming
  // in against a spending category is a refund.
  if (hasSpendingCategory) return amount < 0 ? 'return' : 'expense';

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
      // A credit card never receives income. Money arriving on one is the bank paying the
      // card (Plaid sometimes tags that INCOME, e.g. "Payment - Bilt Housing" as
      // INCOME_RENTAL), which is a transfer between the user's own accounts.
      return isCreditCardAccount(accountType) && amount < 0 ? 'transfer' : 'income';
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
