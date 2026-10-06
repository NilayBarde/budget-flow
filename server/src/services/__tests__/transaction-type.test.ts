import { describe, it, expect } from 'vitest';
import { detectTransactionType } from '../transaction-type.js';

describe('detectTransactionType', () => {
  // ── Transfer detection via text patterns ──────────────────────────────

  describe('transfer detection (text patterns)', () => {
    const transferCases: [string, string][] = [
      ['Credit Card Auto Pay', 'credit card auto pay'],
      ['Credit Card-Payment', 'credit card payment'],
      ['Card Payment Thank You', 'card payment'],
      ['Payment Thank You', 'payment thank you'],
      ['AutoPay', 'autopay'],
      ['Auto-Pay Confirmation', 'auto-pay'],
      ['CREDIT CRD', 'credit crd'],
      ['CRD AUTOPAY', 'crd autopay'],
      ['EPAYMENT RECEIVED', 'epayment'],
      ['E-Payment ACH', 'e-payment'],
      ['Bank Transfer Out', 'transfer keyword'],
      ['Wire Transfer', 'wire transfer'],
      ['payment', 'exact "payment"'],
      ['Bill Pay Electric', 'bill pay'],
      ['BillPay Water', 'billpay'],
      ['Direct Debit Insurance', 'direct debit'],
      ['Loan Payment', 'loan payment'],
      ['Mortgage Payment', 'mortgage payment'],
      ['Monthly PMT', 'pmt abbreviation'],
      ['Zelle Payment John', 'zelle'],
      ['Cash App Transfer', 'cash app'],
      ['AcctVerify Micro-Deposit', 'acctverify'],
      ['Account Verification', 'account verification'],
      ['Apple Cash-Bank Xfer', 'bank xfer'],
      ['Mobile PMT Received', 'mobile pmt'],
      ['Amex Epayment-Ach Pmt', 'ach pmt'],
      ['Emergency Fund Money Out Cash', 'money out cash'],
      ['Emergency Fund Money In Cash', 'money in cash'],
      ['Emergency Fund Money Out', 'fund money out'],
    ];

    for (const [text, label] of transferCases) {
      it(`detects "${text}" as transfer (${label})`, () => {
        expect(detectTransactionType(50, [text])).toBe('transfer');
      });
    }
  });

  // ── Investment detection via text patterns ────────────────────────────

  describe('investment detection (text patterns)', () => {
    const investmentCases: [string, string][] = [
      ['Robinhood-Debits-123', 'robinhood debits'],
      ['Robinhood Debit', 'robinhood debit'],
      ['Fidelity Investments', 'fidelity'],
      ['Vanguard Brokerage', 'vanguard'],
      ['Charles Schwab', 'schwab'],
      ['Etrade Purchase', 'etrade'],
      ['E-Trade Securities', 'e-trade'],
      ['TD Ameritrade', 'td ameritrade'],
      ['Coinbase Purchase', 'coinbase'],
      ['Webull Securities', 'webull'],
      ['Acorns Investing', 'acorns'],
      ['Betterment Auto-Invest', 'betterment'],
    ];

    for (const [text, label] of investmentCases) {
      it(`detects "${text}" as investment (${label})`, () => {
        expect(detectTransactionType(100, [text])).toBe('investment');
      });
    }
  });

  // ── Priority: transfer wins over investment ───────────────────────────

  describe('priority ordering', () => {
    it('transfer pattern wins over investment pattern (e.g., Robinhood Card Payment)', () => {
      // "Card Payment" matches transfer; "Robinhood" matches investment.
      // Transfer should win because it's checked first.
      expect(detectTransactionType(50, ['Robinhood Card Payment'])).toBe('transfer');
    });

    it('transfer pattern wins when texts array has both types', () => {
      expect(detectTransactionType(50, ['Zelle', 'Fidelity'])).toBe('transfer');
    });

    it('"Etrade Transfer" is transfer (transfer keyword takes priority)', () => {
      expect(detectTransactionType(100, ['Etrade Transfer'])).toBe('transfer');
    });

    it('plain "Robinhood" without debit(s) is expense (pattern requires debits?)', () => {
      expect(detectTransactionType(100, ['Robinhood'])).toBe('expense');
    });
  });

  // ── Plaid PFC-based detection ─────────────────────────────────────────

  describe('Plaid PFC detection', () => {
    it('detects TRANSFER_IN as transfer', () => {
      expect(
        detectTransactionType(50, ['Unknown Merchant'], { primary: 'TRANSFER_IN' }),
      ).toBe('transfer');
    });

    it('detects TRANSFER_OUT as transfer', () => {
      expect(
        detectTransactionType(50, ['Unknown Merchant'], { primary: 'TRANSFER_OUT' }),
      ).toBe('transfer');
    });

    it('detects LOAN_PAYMENTS as transfer', () => {
      expect(
        detectTransactionType(100, ['SoFi'], { primary: 'LOAN_PAYMENTS' }),
      ).toBe('transfer');
    });

    it('detects INCOME PFC as income (positive amount)', () => {
      expect(
        detectTransactionType(3000, ['Employer Inc'], { primary: 'INCOME' }),
      ).toBe('income');
    });

    it('detects investment via Plaid detailed category', () => {
      expect(
        detectTransactionType(500, ['Some Broker'], {
          primary: 'TRANSFER_OUT',
          detailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS',
        }),
      ).toBe('investment');
    });

    it('detects retirement via Plaid detailed category', () => {
      expect(
        detectTransactionType(200, ['401k Contribution'], {
          primary: 'TRANSFER_OUT',
          detailed: 'RETIREMENT_CONTRIBUTION',
        }),
      ).toBe('investment');
    });

    it('does not treat BANK_FEES as a transfer', () => {
      expect(detectTransactionType(12, ['Monthly Service Fee'], { primary: 'BANK_FEES' })).toBe('expense');
    });

    it('still types an INVESTMENT detailed category as investment when the primary is INCOME', () => {
      expect(
        detectTransactionType(-40, ['Brokerage'], { primary: 'INCOME', detailed: 'INCOME_INVESTMENT_GAIN' }),
      ).toBe('investment');
    });

    it('treats pension income as income, not as a retirement investment', () => {
      // The detailed category contains RETIREMENT, but the primary says money is coming in as income.
      expect(
        detectTransactionType(-1800, ['State Pension'], {
          primary: 'INCOME',
          detailed: 'INCOME_RETIREMENT_PENSION',
        }),
      ).toBe('income');
    });
  });

  // ── Plaid spending category beats text patterns ───────────────────────

  describe('Plaid spending category overrides text patterns', () => {
    it('utility bill payment is an expense, not a transfer', () => {
      expect(
        detectTransactionType(394.21, ['Con Edison', 'CONED BILL PAYMENT'], {
          primary: 'RENT_AND_UTILITIES',
          detailed: 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY',
        }),
      ).toBe('expense');
    });

    it('phone bill payment is an expense', () => {
      expect(
        detectTransactionType(30.39, ['ATT* BILL PAYMENT'], {
          primary: 'RENT_AND_UTILITIES',
          detailed: 'RENT_AND_UTILITIES_OTHER_UTILITIES',
        }),
      ).toBe('expense');
    });

    it('card payment stays a transfer even when Plaid mislabels it as spending', () => {
      // Plaid returned RENT_AND_UTILITIES_RENT for a Bilt card payment
      expect(
        detectTransactionType(13.18, ['Bilt Card - PMT Withdrawal WITHDRAWAL'], {
          primary: 'RENT_AND_UTILITIES',
          detailed: 'RENT_AND_UTILITIES_RENT',
        }),
      ).toBe('transfer');
      expect(
        detectTransactionType(40, ['Zelle Cafe'], { primary: 'FOOD_AND_DRINK' }),
      ).toBe('transfer');
      expect(
        detectTransactionType(317.99, ['Amex Epayment - ACH Payment Withdrawal'], {
          primary: 'GENERAL_SERVICES',
        }),
      ).toBe('transfer');
    });

    it('direct debit and billpay wording also yield to a spending category', () => {
      expect(
        detectTransactionType(80, ['Direct Debit Insurance'], { primary: 'GENERAL_SERVICES' }),
      ).toBe('expense');
      expect(
        detectTransactionType(60, ['BillPay Water'], { primary: 'RENT_AND_UTILITIES' }),
      ).toBe('expense');
    });

    it('spending category beats an investment pattern', () => {
      expect(
        detectTransactionType(100, ['Fidelity Cafe'], { primary: 'FOOD_AND_DRINK' }),
      ).toBe('expense');
    });

    it('negative amount on a spending category is a return', () => {
      expect(
        detectTransactionType(-30, ['Bill Pay Refund'], { primary: 'GENERAL_MERCHANDISE' }),
      ).toBe('return');
    });

    it('vague Plaid categories still fall through to the text patterns', () => {
      expect(
        detectTransactionType(50, ['Zelle Payment'], { primary: 'OTHER' }),
      ).toBe('transfer');
      expect(
        detectTransactionType(100, ['Fidelity'], { primary: 'TRANSFER_OUT' }),
      ).toBe('investment');
      expect(
        detectTransactionType(520, ['Payment'], { primary: 'LOAN_PAYMENTS' }),
      ).toBe('transfer');
    });

    it('INCOME category does not override a transfer pattern', () => {
      expect(
        detectTransactionType(-63.45, ['Emergency fund Money in CASH_CATEGORY'], {
          primary: 'INCOME',
        }),
      ).toBe('transfer');
    });

    it('missing Plaid category keeps the text pattern behavior', () => {
      expect(detectTransactionType(394.21, ['CONED BILL PAYMENT'], null)).toBe('transfer');
    });
  });

  // ── Amount sign logic ─────────────────────────────────────────────────

  describe('amount sign logic', () => {
    it('positive amount with no patterns = expense', () => {
      expect(detectTransactionType(25.99, ['Target'])).toBe('expense');
    });

    it('negative amount with no PFC = return', () => {
      expect(detectTransactionType(-15.0, ['Amazon Refund'])).toBe('return');
    });

    it('negative amount with INCOME PFC = income', () => {
      expect(
        detectTransactionType(-3000, ['Employer'], { primary: 'INCOME' }),
      ).toBe('income');
    });

    it('negative amount with non-INCOME PFC = return', () => {
      expect(
        detectTransactionType(-20, ['Amazon'], { primary: 'SHOPPING' }),
      ).toBe('return');
    });
  });

  // ── Credit card inflows ───────────────────────────────────────────────

  describe('credit card inflows', () => {
    it('a payment into a credit card is a transfer even when Plaid tags it INCOME', () => {
      // Real Bilt row: the bank autopay landing on the card, tagged INCOME_RENTAL by Plaid.
      expect(
        detectTransactionType(
          -2497.49,
          ['Payment - Bilt Housing'],
          { primary: 'INCOME', detailed: 'INCOME_RENTAL' },
          'credit card',
        ),
      ).toBe('transfer');
    });

    it('still treats income as income on a checking account', () => {
      expect(
        detectTransactionType(-3000, ['Employer'], { primary: 'INCOME' }, 'checking'),
      ).toBe('income');
    });

    it('still treats a refund on a credit card as a return', () => {
      expect(
        detectTransactionType(-20, ['Amazon'], { primary: 'GENERAL_MERCHANDISE' }, 'credit card'),
      ).toBe('return');
    });

    it('does not change behavior when the account type is unknown', () => {
      expect(
        detectTransactionType(-2497.49, ['Payment - Bilt Housing'], { primary: 'INCOME' }),
      ).toBe('income');
    });
  });

  // ── Card bill wording on the bank side ────────────────────────────────

  describe('card bill payments from a bank account', () => {
    // Plaid shortens these to the card issuer's name and labels them as investment transfers,
    // so only the raw bank text tells a card bill from a brokerage contribution.
    const brokerageTransferOut = {
      primary: 'TRANSFER_OUT',
      detailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS',
    };

    it('types a credit card bill (CCB) payment as a transfer, not an investment', () => {
      expect(
        detectTransactionType(520.13, ['Robinhood', 'Robinhood Ccb - Payment Withdrawal WITHDRAWAL'], brokerageTransferOut),
      ).toBe('transfer');
      expect(
        detectTransactionType(55.52, ['Robinhood', 'Robinhood Ccb-Payment Withdrawal DDA_TRANSACTION'], brokerageTransferOut),
      ).toBe('transfer');
    });

    it('matches "Card - Payment" with spaces and a dash, not only "card-payment"', () => {
      for (const text of [
        'Robinhood Card - Payment Withdrawal WITHDRAWAL',
        'Robinhood Card-Payment Withdrawal DDA_TRANSACTION',
        'Acme Card Payment Withdrawal',
        'Acme Card – Payment',
      ]) {
        expect(detectTransactionType(100, ['Acme', text], brokerageTransferOut)).toBe('transfer');
      }
    });

    it('still types a brokerage contribution as an investment', () => {
      for (const text of ['Robinhood - Debits Withdrawal WITHDRAWAL', 'Robinhood-Debits-411981616 Withdrawal DDA_TRANSACTION']) {
        expect(detectTransactionType(500, ['Robinhood', text], brokerageTransferOut)).toBe('investment');
      }
    });

    it('recognizes "Robinhood - Debits" with spaces as a contribution even without a brokerage category', () => {
      expect(detectTransactionType(540, ['Robinhood', 'Robinhood - Debits Withdrawal WITHDRAWAL'], { primary: 'TRANSFER_OUT' })).toBe('investment');
    });

    it('does not match card payment inside a longer word', () => {
      for (const text of ['Discard Payment Center', 'Scorecard Payment Plan']) {
        expect(detectTransactionType(40, [text], { primary: 'GENERAL_SERVICES' })).toBe('expense');
      }
    });

    it('does not mistake words that merely contain ccb for a card bill', () => {
      expect(detectTransactionType(40, ['Accbury Cafe'], { primary: 'FOOD_AND_DRINK' })).toBe('expense');
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('empty texts array = expense for positive amount', () => {
      expect(detectTransactionType(50, [])).toBe('expense');
    });

    it('empty texts array = return for negative amount', () => {
      expect(detectTransactionType(-50, [])).toBe('return');
    });

    it('empty string in texts = expense for positive amount', () => {
      expect(detectTransactionType(50, [''])).toBe('expense');
    });

    it('null PFC is treated the same as missing PFC', () => {
      expect(detectTransactionType(50, ['Target'], null)).toBe('expense');
    });

    it('zero amount defaults to expense', () => {
      expect(detectTransactionType(0, ['Somewhere'])).toBe('expense');
    });

    it('text pattern check is case-insensitive', () => {
      expect(detectTransactionType(50, ['ZELLE PAYMENT'])).toBe('transfer');
      expect(detectTransactionType(50, ['zelle payment'])).toBe('transfer');
      expect(detectTransactionType(100, ['FIDELITY'])).toBe('investment');
      expect(detectTransactionType(100, ['fidelity'])).toBe('investment');
    });

    it('multiple texts - any match is sufficient', () => {
      // Only the third text matches
      expect(
        detectTransactionType(50, ['Unknown', 'Nothing', 'Zelle Transfer']),
      ).toBe('transfer');
    });
  });
});
