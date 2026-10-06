import { SPENDING_PFC_PRIMARY, type TransactionType } from './transaction-type.js';

// Paying a credit card shows up twice: money leaves a bank account and the same amount lands on
// the card. Both rows are one transfer, whatever Plaid categorized them as (a rent payment
// through a card comes back as RENT or INCOME on one leg and spending on the other). Accounts,
// exact amount and date find the candidates, and both legs must also look like a card payment,
// so two unrelated rows that merely share an amount are never paired.

export interface PairingRow {
  id: string;
  account_id: string;
  /** Positive = money out of the account, negative = money in (Plaid's sign). */
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  transaction_type: TransactionType;
  type_manually_set?: boolean | null;
  is_credit_card: boolean;
  /** Checking, savings and similar. Only these can fund a card payment. */
  is_cash_account: boolean;
  plaid_primary?: string | null;
  /** Merchant name and bank description, joined. */
  description?: string | null;
  /** Institution and account name, e.g. "Bilt Rewards Bilt Blue Card". */
  account_label?: string | null;
}

// Card payments post to the card a day or two after they leave the bank.
const DEFAULT_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const toCents = (amount: number): number => Math.round(Math.abs(amount) * 100);
const daysBetween = (a: string, b: string): number => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;

// A type the user chose by hand always stands, unless it already says transfer.
const isLockedNonTransfer = (row: PairingRow): boolean =>
  Boolean(row.type_manually_set) && row.transaction_type !== 'transfer';

// ── Card leg ─────────────────────────────────────────────────────────────

// How a card statement words a payment, whichever bank it came from.
const PAYMENT_WORDS = /\b(payment|pmt|autopay|auto[- ]?pay|thank\s*you)\b/i;
const CARD_PAYMENT_PFC_PRIMARY = ['LOAN_PAYMENTS', 'TRANSFER_IN'];

// Wording of a credit that is not a payment, even when it also says "payment" ("Payment
// Protection Credit", "Reward Payment"). "Credit card" is a payment, so only a bare "credit" counts.
const NOT_A_PAYMENT_WORDS =
  /\b(refund|reversal|rewards?|cashback|bonus|adjustment|adj|protection|dispute)\b|\bstatement\s+credit\b|\bcredit\b(?!\s*card)/i;

// Money arriving on a card is not necessarily a payment: refunds and statement credits also
// look like that. It counts as a payment only with positive evidence (already a transfer, Plaid
// calls it a payment, or the text says so), and never when Plaid gives it a spending category
// (a merchant refund) or the text says it is a credit. A hand typed transfer settles it either way.
const isPaymentLeg = (card: PairingRow): boolean => {
  if (isLockedNonTransfer(card)) return false;
  if (card.type_manually_set) return true;
  if (card.plaid_primary && SPENDING_PFC_PRIMARY.includes(card.plaid_primary)) return false;
  if (NOT_A_PAYMENT_WORDS.test(card.description ?? '')) return false;
  return (
    card.transaction_type === 'transfer' ||
    Boolean(card.plaid_primary && CARD_PAYMENT_PFC_PRIMARY.includes(card.plaid_primary)) ||
    PAYMENT_WORDS.test(card.description ?? '')
  );
};

// ── Bank leg ─────────────────────────────────────────────────────────────

// Only Plaid's loan payment category counts. A generic TRANSFER_OUT also covers ATM withdrawals
// and Venmo sends, so it proves nothing about a card.
const BANK_PAYMENT_PFC_PRIMARY = ['LOAN_PAYMENTS'];

// Words that appear on many card payments or cards, so sharing one proves nothing.
const GENERIC_WORDS = new Set([
  'account', 'amex', 'autopay', 'automatic', 'bank', 'bill', 'billpay', 'card', 'cards', 'cash',
  'checking', 'credit', 'debit', 'deposit', 'ending', 'elite', 'from', 'funds', 'gold', 'individual',
  'mastercard', 'mobile', 'monthly', 'online', 'payment', 'payments', 'platinum', 'preferred',
  'purchase', 'pymt', 'recurring', 'reward', 'rewards', 'savings', 'signature', 'thank', 'transfer',
  'visa', 'web', 'with', 'withdrawal', 'world',
]);

const distinctiveWords = (text?: string | null): Set<string> =>
  new Set(
    (text ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(word => word.length >= 4 && !GENERIC_WORDS.has(word)),
  );

// The bank row must itself look like a card payment: already a transfer, a Plaid transfer or
// loan payment, or text that names the card's issuer or the same thing the card row names.
// Without this, an unrelated purchase that happens to match an amount would be hidden.
const looksLikeFundingForCard = (bank: PairingRow, card: PairingRow): boolean => {
  if (bank.transaction_type === 'transfer') return true;
  if (bank.plaid_primary && BANK_PAYMENT_PFC_PRIMARY.includes(bank.plaid_primary)) return true;

  const bankWords = distinctiveWords(bank.description);
  if (bankWords.size === 0) return false;
  const cardWords = new Set([...distinctiveWords(card.account_label), ...distinctiveWords(card.description)]);
  return [...bankWords].some(word => cardWords.has(word));
};

/**
 * Find the rows that are a leg of a credit card payment but are not typed as a transfer yet.
 * A card payment is paired with the cash account outflow of the exact same amount within a few
 * days. Ambiguous matches are skipped rather than guessed, rows the user typed by hand are left
 * alone, and an investment is never demoted: weekly brokerage debits can equal a card bill to
 * the cent, and what counts as "invested" is the user's decision.
 *
 * @returns ids of the rows to retype as transfers
 */
export const findCardPaymentCounterparts = (
  rows: PairingRow[],
  windowDays: number = DEFAULT_WINDOW_DAYS,
): string[] => {
  const cardLegs = rows.filter(r => r.is_credit_card && r.amount < 0 && isPaymentLeg(r));
  const bankLegs = rows.filter(
    r => r.is_cash_account && r.amount > 0 && !isLockedNonTransfer(r) && r.transaction_type !== 'investment',
  );
  const byId = new Map(rows.map(r => [r.id, r]));

  // Each card leg picks its single closest bank leg, or none when there is a tie.
  const chosenBank = new Map<string, string>();
  for (const card of cardLegs) {
    const candidates = bankLegs
      .filter(bank =>
        bank.account_id !== card.account_id &&
        toCents(bank.amount) === toCents(card.amount) &&
        daysBetween(bank.date, card.date) <= windowDays &&
        looksLikeFundingForCard(bank, card))
      .map(bank => ({ id: bank.id, distance: daysBetween(bank.date, card.date) }))
      .sort((a, b) => a.distance - b.distance);

    if (candidates.length === 0) continue;
    if (candidates.length > 1 && candidates[0].distance === candidates[1].distance) continue;
    chosenBank.set(card.id, candidates[0].id);
  }

  // A bank row claimed by several card payments cannot be told apart, so none of them pair.
  const claims = new Map<string, number>();
  for (const bankId of chosenBank.values()) claims.set(bankId, (claims.get(bankId) ?? 0) + 1);

  const toRetype = new Set<string>();
  for (const [cardId, bankId] of chosenBank) {
    if (claims.get(bankId) !== 1) continue;
    const card = byId.get(cardId)!;
    const bank = byId.get(bankId)!;
    if (card.transaction_type !== 'transfer') toRetype.add(card.id);
    if (bank.transaction_type !== 'transfer') toRetype.add(bank.id);
  }
  return [...toRetype];
};
