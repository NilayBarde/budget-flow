import { describe, it, expect } from 'vitest';
import { findCardPaymentCounterparts, type PairingRow } from '../card-payment-pairing.js';

let counter = 0;
const row = (overrides: Partial<PairingRow> = {}): PairingRow => ({
  id: `r${++counter}`,
  account_id: 'bank',
  amount: 100,
  date: '2026-08-03',
  transaction_type: 'expense',
  type_manually_set: false,
  is_credit_card: false,
  plaid_primary: null,
  ...overrides,
});

// The card side of a payment: money arriving on a credit card (negative amount).
const cardInflow = (overrides: Partial<PairingRow> = {}) =>
  row({ account_id: 'card', is_credit_card: true, amount: -100, transaction_type: 'transfer', ...overrides });

// The bank side: money leaving a bank account (positive amount).
const bankOutflow = (overrides: Partial<PairingRow> = {}) => row({ account_id: 'bank', amount: 100, ...overrides });

describe('findCardPaymentCounterparts', () => {
  it('retypes the bank leg when it matches a card payment already known to be a transfer', () => {
    // Real Bilt case: the rent payment lands on the card, and the bank withdrawal was typed as spending.
    const card = cardInflow({ amount: -2497.49 });
    const bank = bankOutflow({ amount: 2497.49, plaid_primary: 'RENT_AND_UTILITIES' });
    expect(findCardPaymentCounterparts([card, bank])).toEqual([bank.id]);
  });

  it('retypes both legs when the card leg says payment and neither is a transfer yet', () => {
    const card = cardInflow({ transaction_type: 'income', plaid_primary: 'INCOME', description: 'Payment - Bilt Housing' });
    const bank = bankOutflow();
    expect(findCardPaymentCounterparts([card, bank]).sort()).toEqual([bank.id, card.id].sort());
  });

  it('works for any bank and card, using the common wording of a card payment', () => {
    for (const description of ['AUTOPAY PAYMENT - THANK YOU', 'ONLINE PMT', 'Payment', 'Mobile Payment Thank You']) {
      const card = cardInflow({ account_id: 'other-card', amount: -812.4, transaction_type: 'return', description });
      const bank = bankOutflow({ account_id: 'other-bank', amount: 812.4 });
      expect(findCardPaymentCounterparts([card, bank]).sort()).toEqual([bank.id, card.id].sort());
    }
  });

  it('accepts a card leg Plaid already calls a loan or transfer payment, with no payment wording', () => {
    for (const plaid_primary of ['LOAN_PAYMENTS', 'TRANSFER_IN']) {
      const card = cardInflow({ transaction_type: 'return', plaid_primary, description: 'ACH 8841' });
      const bank = bankOutflow();
      expect(findCardPaymentCounterparts([card, bank]).sort()).toEqual([bank.id, card.id].sort());
    }
  });

  it('does not treat a statement credit as a payment, even if an unrelated amount matches', () => {
    // An Amex perk credit has no payment wording and an OTHER category.
    const credit = cardInflow({ transaction_type: 'return', plaid_primary: 'OTHER', description: 'Platinum Resy Credit' });
    const unrelated = bankOutflow({ date: '2026-08-05' });
    expect(findCardPaymentCounterparts([credit, unrelated])).toEqual([]);
  });

  it('never demotes an investment, even when its amount matches a card payment', () => {
    // Weekly brokerage debits can equal a card bill to the cent. "Invested" totals stay the user's call.
    const card = cardInflow();
    const investment = bankOutflow({ transaction_type: 'investment' });
    expect(findCardPaymentCounterparts([card, investment])).toEqual([]);
  });

  it('never pairs a merchant refund, which Plaid tags with a spending category', () => {
    const refund = cardInflow({ transaction_type: 'return', plaid_primary: 'GENERAL_MERCHANDISE' });
    const unrelatedSpend = bankOutflow();
    expect(findCardPaymentCounterparts([refund, unrelatedSpend])).toEqual([]);
  });

  it('does not pair a refund even when the bank row is a transfer', () => {
    const refund = cardInflow({ transaction_type: 'return', plaid_primary: 'FOOD_AND_DRINK' });
    const zelle = bankOutflow({ transaction_type: 'transfer' });
    expect(findCardPaymentCounterparts([refund, zelle])).toEqual([]);
  });

  it('matches within 3 days and not at 4', () => {
    const card = cardInflow({ date: '2026-08-06' });
    expect(findCardPaymentCounterparts([card, bankOutflow({ date: '2026-08-03' })])).toHaveLength(1);
    expect(findCardPaymentCounterparts([card, bankOutflow({ date: '2026-08-02' })])).toEqual([]);
  });

  it('requires the amount to match to the cent', () => {
    const card = cardInflow({ amount: -100 });
    expect(findCardPaymentCounterparts([card, bankOutflow({ amount: 100.01 })])).toEqual([]);
    expect(findCardPaymentCounterparts([card, bankOutflow({ amount: 99.99 })])).toEqual([]);
  });

  it('tolerates floating point noise in amounts', () => {
    const card = cardInflow({ amount: -(0.1 + 0.2) });
    const bank = bankOutflow({ amount: 0.3 });
    expect(findCardPaymentCounterparts([card, bank])).toEqual([bank.id]);
  });

  it('never pairs two rows on the same account', () => {
    const card = cardInflow({ account_id: 'card' });
    const sameAccountCharge = row({ account_id: 'card', is_credit_card: true, amount: 100 });
    expect(findCardPaymentCounterparts([card, sameAccountCharge])).toEqual([]);
  });

  it('does not treat another credit card as the funding bank account', () => {
    const card = cardInflow({ account_id: 'card-a' });
    const otherCardCharge = row({ account_id: 'card-b', is_credit_card: true, amount: 100 });
    expect(findCardPaymentCounterparts([card, otherCardCharge])).toEqual([]);
  });

  it('picks the nearer bank row when two candidates are at different distances', () => {
    const card = cardInflow({ date: '2026-08-05' });
    const near = bankOutflow({ date: '2026-08-05' });
    const far = bankOutflow({ date: '2026-08-03' });
    expect(findCardPaymentCounterparts([card, near, far])).toEqual([near.id]);
  });

  it('skips an ambiguous match instead of guessing', () => {
    const card = cardInflow({ date: '2026-08-05' });
    const a = bankOutflow({ date: '2026-08-04' });
    const b = bankOutflow({ date: '2026-08-06' });
    expect(findCardPaymentCounterparts([card, a, b])).toEqual([]);
  });

  it('skips when two card payments compete for one bank row', () => {
    const first = cardInflow({ account_id: 'card-a' });
    const second = cardInflow({ account_id: 'card-b' });
    const bank = bankOutflow();
    expect(findCardPaymentCounterparts([first, second, bank])).toEqual([]);
  });

  it('pairs a repeating monthly payment with the right month', () => {
    const augCard = cardInflow({ date: '2026-08-03' });
    const augBank = bankOutflow({ date: '2026-08-03' });
    const sepCard = cardInflow({ date: '2026-09-03' });
    const sepBank = bankOutflow({ date: '2026-09-03' });
    expect(findCardPaymentCounterparts([augCard, augBank, sepCard, sepBank]).sort()).toEqual([augBank.id, sepBank.id].sort());
  });

  it('leaves a row alone when the user typed it by hand', () => {
    const card = cardInflow();
    const manualBank = bankOutflow({ type_manually_set: true });
    expect(findCardPaymentCounterparts([card, manualBank])).toEqual([]);
  });

  it('skips the pair when the user typed the card leg as something other than a transfer', () => {
    const card = cardInflow({ transaction_type: 'income', type_manually_set: true });
    const bank = bankOutflow();
    expect(findCardPaymentCounterparts([card, bank])).toEqual([]);
  });

  it('uses a hand typed transfer as the anchor for its counterpart', () => {
    const card = cardInflow({ transaction_type: 'transfer', type_manually_set: true, plaid_primary: 'GENERAL_MERCHANDISE' });
    const bank = bankOutflow();
    // A card leg with a spending category is a refund unless the user said otherwise.
    expect(findCardPaymentCounterparts([card, bank])).toEqual([bank.id]);
  });

  it('returns nothing when both legs are already transfers', () => {
    expect(findCardPaymentCounterparts([cardInflow(), bankOutflow({ transaction_type: 'transfer' })])).toEqual([]);
  });

  it('ignores zero amounts and an empty list', () => {
    expect(findCardPaymentCounterparts([])).toEqual([]);
    expect(findCardPaymentCounterparts([cardInflow({ amount: 0 }), bankOutflow({ amount: 0 })])).toEqual([]);
  });
});
