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
  is_cash_account: true,
  plaid_primary: null,
  description: null,
  account_label: null,
  ...overrides,
});

// The card side of a payment: money arriving on a credit card (negative amount). By default it
// is already known to be a transfer and its account is an "Acme Card".
const cardInflow = (overrides: Partial<PairingRow> = {}) =>
  row({
    account_id: 'card',
    is_credit_card: true,
    is_cash_account: false,
    amount: -100,
    transaction_type: 'transfer',
    description: 'Payment - Acme Rent',
    account_label: 'Acme Rewards Acme Blue Card',
    ...overrides,
  });

// The bank side: money leaving a cash account (positive amount). By default its text names the
// card issuer, which is what a real payment looks like on the bank statement.
const bankOutflow = (overrides: Partial<PairingRow> = {}) =>
  row({ account_id: 'bank', amount: 100, description: 'Acme Card - Rent Withdrawal', ...overrides });

const sorted = (ids: string[]) => [...ids].sort();

describe('findCardPaymentCounterparts', () => {
  it('retypes the bank leg when it matches a card payment already known to be a transfer', () => {
    // Real Bilt case: the rent payment lands on the card, and the bank withdrawal was typed as spending.
    const card = cardInflow({ amount: -2497.49 });
    const bank = bankOutflow({ amount: 2497.49, plaid_primary: 'RENT_AND_UTILITIES' });
    expect(findCardPaymentCounterparts([card, bank])).toEqual([bank.id]);
  });

  it('retypes both legs when the card leg says payment and neither is a transfer yet', () => {
    const card = cardInflow({ transaction_type: 'income', plaid_primary: 'INCOME' });
    const bank = bankOutflow();
    expect(sorted(findCardPaymentCounterparts([card, bank]))).toEqual(sorted([bank.id, card.id]));
  });

  describe('card leg evidence', () => {
    it('works with the common wording of a card payment, whichever bank it came from', () => {
      for (const description of ['AUTOPAY PAYMENT - THANK YOU', 'ONLINE PMT', 'Payment', 'Mobile Payment Thank You']) {
        const card = cardInflow({ transaction_type: 'return', description: `${description} Acme` });
        const bank = bankOutflow();
        expect(sorted(findCardPaymentCounterparts([card, bank]))).toEqual(sorted([bank.id, card.id]));
      }
    });

    it('accepts a card leg Plaid already calls a loan or transfer payment, with no payment wording', () => {
      for (const plaid_primary of ['LOAN_PAYMENTS', 'TRANSFER_IN']) {
        const card = cardInflow({ transaction_type: 'return', plaid_primary, description: 'ACH 8841' });
        const bank = bankOutflow();
        expect(sorted(findCardPaymentCounterparts([card, bank]))).toEqual(sorted([bank.id, card.id]));
      }
    });

    it('does not treat a statement credit as a payment', () => {
      const credit = cardInflow({ transaction_type: 'return', plaid_primary: 'OTHER', description: 'Acme Resy Credit' });
      expect(findCardPaymentCounterparts([credit, bankOutflow()])).toEqual([]);
    });

    it('never pairs a merchant refund, which Plaid tags with a spending category', () => {
      const refund = cardInflow({ transaction_type: 'return', plaid_primary: 'GENERAL_MERCHANDISE' });
      expect(findCardPaymentCounterparts([refund, bankOutflow()])).toEqual([]);
    });

    it('does not pair a refund even when the bank row is a transfer', () => {
      const refund = cardInflow({ transaction_type: 'return', plaid_primary: 'FOOD_AND_DRINK' });
      expect(findCardPaymentCounterparts([refund, bankOutflow({ transaction_type: 'transfer' })])).toEqual([]);
    });
  });

  describe('bank leg evidence', () => {
    it('does not hide a real purchase that only shares an amount with a card refund', () => {
      // $15.99 card credit worded like a payment, and an unrelated $15.99 subscription on the bank.
      const credit = cardInflow({
        amount: -15.99,
        transaction_type: 'return',
        plaid_primary: 'OTHER',
        description: 'Payment Protection Credit',
      });
      const netflix = bankOutflow({ amount: 15.99, description: 'NETFLIX', plaid_primary: 'ENTERTAINMENT' });
      expect(findCardPaymentCounterparts([credit, netflix])).toEqual([]);
    });

    it('does not retype an unrelated bank row when the real payment came from an unsynced account', () => {
      const card = cardInflow({ description: 'PAYMENT THANK YOU' });
      const atm = bankOutflow({ description: 'ATM WITHDRAWAL 5th Ave' });
      expect(findCardPaymentCounterparts([card, atm])).toEqual([]);
    });

    it('accepts a bank row Plaid calls a loan payment', () => {
      const bank = bankOutflow({ description: 'ACH 3321', plaid_primary: 'LOAN_PAYMENTS' });
      expect(findCardPaymentCounterparts([cardInflow(), bank])).toEqual([bank.id]);
    });

    it('does not accept a generic Plaid transfer out, which also covers ATM withdrawals and Venmo sends', () => {
      const atm = bankOutflow({ description: 'ATM WITHDRAWAL', plaid_primary: 'TRANSFER_OUT' });
      expect(findCardPaymentCounterparts([cardInflow(), atm])).toEqual([]);
    });

    it('does not let a refund worded like a payment ride on an unrelated bank transfer', () => {
      for (const description of ['Payment Protection Credit', 'Payment Refund', 'Reward Payment', 'Statement Credit - Payment Adj']) {
        const credit = cardInflow({ transaction_type: 'return', plaid_primary: 'OTHER', description, amount: -15.99 });
        const zelle = bankOutflow({ transaction_type: 'transfer', amount: 15.99, description: 'Zelle to Sam' });
        expect(findCardPaymentCounterparts([credit, zelle])).toEqual([]);
      }
    });

    it('still accepts credit card wording that contains the word credit', () => {
      const card = cardInflow({ transaction_type: 'return', description: 'CREDIT CARD AUTOPAY Acme' });
      const bank = bankOutflow();
      expect(sorted(findCardPaymentCounterparts([card, bank]))).toEqual(sorted([bank.id, card.id]));
    });

    it('does not count words common to many payments as a shared name', () => {
      // Both say AUTOMATIC PAYMENT, which proves nothing about the card.
      const card = cardInflow({ transaction_type: 'return', description: 'AUTOMATIC PAYMENT THANK YOU', account_label: 'Some Credit Card' });
      const insurance = bankOutflow({ description: 'GEICO AUTOMATIC PAYMENT' });
      expect(findCardPaymentCounterparts([card, insurance])).toEqual([]);
    });

    it('accepts a bank row that is already a transfer, which only completes the card side', () => {
      const card = cardInflow({ transaction_type: 'income', description: 'Payment' });
      const bank = bankOutflow({ transaction_type: 'transfer', description: 'ACH 3321' });
      expect(findCardPaymentCounterparts([card, bank])).toEqual([card.id]);
    });

    it('accepts a bank row whose text names the card issuer from the account name', () => {
      const card = cardInflow({ description: 'Payment', account_label: 'Wells Fargo Visa Signature' });
      const bank = bankOutflow({ description: 'WELLS FARGO CARD PMT' });
      expect(findCardPaymentCounterparts([card, bank])).toEqual([bank.id]);
    });

    it('ignores generic words when looking for a shared name', () => {
      // "card", "payment" and "withdrawal" appear on every card payment and prove nothing.
      const card = cardInflow({ description: 'Payment', account_label: 'Some Credit Card' });
      const bank = bankOutflow({ description: 'Card Payment Withdrawal' });
      expect(findCardPaymentCounterparts([card, bank])).toEqual([]);
    });

    it('only treats cash accounts as the funding side, never a brokerage that carries card purchases', () => {
      const card = cardInflow();
      const brokerage = bankOutflow({ is_cash_account: false });
      expect(findCardPaymentCounterparts([card, brokerage])).toEqual([]);
    });

    it('never demotes an investment, even when its amount matches a card payment', () => {
      const card = cardInflow();
      const investment = bankOutflow({ transaction_type: 'investment' });
      expect(findCardPaymentCounterparts([card, investment])).toEqual([]);
    });
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
    const sameAccountCharge = row({ account_id: 'card', is_credit_card: true, is_cash_account: false, amount: 100 });
    expect(findCardPaymentCounterparts([card, sameAccountCharge])).toEqual([]);
  });

  it('does not treat another credit card as the funding account', () => {
    const card = cardInflow({ account_id: 'card-a' });
    const otherCardCharge = row({
      account_id: 'card-b',
      is_credit_card: true,
      is_cash_account: false,
      amount: 100,
      description: 'Acme Rent',
    });
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
    expect(findCardPaymentCounterparts([first, second, bankOutflow()])).toEqual([]);
  });

  it('pairs a repeating monthly payment with the right month', () => {
    const augCard = cardInflow({ date: '2026-08-03' });
    const augBank = bankOutflow({ date: '2026-08-03' });
    const sepCard = cardInflow({ date: '2026-09-03' });
    const sepBank = bankOutflow({ date: '2026-09-03' });
    expect(sorted(findCardPaymentCounterparts([augCard, augBank, sepCard, sepBank]))).toEqual(sorted([augBank.id, sepBank.id]));
  });

  it('leaves a row alone when the user typed it by hand', () => {
    const manualBank = bankOutflow({ type_manually_set: true });
    expect(findCardPaymentCounterparts([cardInflow(), manualBank])).toEqual([]);
  });

  it('skips the pair when the user typed the card leg as something other than a transfer', () => {
    const card = cardInflow({ transaction_type: 'income', type_manually_set: true });
    expect(findCardPaymentCounterparts([card, bankOutflow()])).toEqual([]);
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
