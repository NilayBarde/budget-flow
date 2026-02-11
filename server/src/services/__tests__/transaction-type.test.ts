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
  });

  // ── Legacy Plaid category detection ───────────────────────────────────

  describe('legacy Plaid category detection', () => {
    it('detects Transfer in legacy categories', () => {
      expect(
        detectTransactionType(50, ['Unknown'], null, ['Transfer', 'Debit']),
      ).toBe('transfer');
    });

    it('detects Credit Card in legacy categories', () => {
      expect(
        detectTransactionType(50, ['Unknown'], null, ['Credit Card']),
      ).toBe('transfer');
    });

    it('detects Loan Payments in legacy categories', () => {
      expect(
        detectTransactionType(500, ['Unknown'], null, ['Loan Payments']),
      ).toBe('transfer');
    });

    it('detects Payment in legacy categories', () => {
      expect(
        detectTransactionType(50, ['Unknown'], null, ['Payment']),
      ).toBe('transfer');
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

    it('null plaidCategories is treated the same as missing', () => {
      expect(detectTransactionType(50, ['Target'], null, null)).toBe('expense');
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
