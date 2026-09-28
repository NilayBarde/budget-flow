import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MerchantMapping } from '../merchant-mappings.js';

// Mock the supabase module before importing the module under test
const mockIn = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

// `select('*')` is awaited directly, while `select(...).in(...)` is chained
const selectResolvesTo = (data: unknown) => mockSelect.mockResolvedValue({ data });
const selectInResolvesTo = (data: unknown) => {
  mockSelect.mockReturnValue({ in: mockIn });
  mockIn.mockResolvedValue({ data });
};

vi.mock('../../db/supabase.js', () => ({
  supabase: { from: mockFrom },
}));

// Import AFTER the mock is set up
const { loadMerchantMappings, loadManuallyTypedIds, resolveTransactionType } =
  await import('../merchant-mappings.js');

const mapping = (overrides: Partial<MerchantMapping> = {}): MerchantMapping => ({
  id: 'map-1',
  original_name: 'EMPOWER FINANCE TRANSFER',
  display_name: 'Empower',
  default_category_id: 'cat-transport',
  default_transaction_type: 'expense',
  ...overrides,
});

describe('loadMerchantMappings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a mapping case-insensitively', async () => {
    selectResolvesTo([mapping()]);

    const mappings = await loadMerchantMappings();

    expect(mappings.find('empower finance transfer')?.display_name).toBe('Empower');
  });

  it('falls back to the next candidate name when the first has no mapping', async () => {
    selectResolvesTo([mapping()]);

    const mappings = await loadMerchantMappings();

    // Plaid often returns no merchant_name, so the mapping was stored under `name`
    expect(mappings.find(null, 'EMPOWER FINANCE TRANSFER')?.display_name).toBe('Empower');
    expect(mappings.find(undefined, '')).toBeUndefined();
  });

  it('returns undefined for an unknown merchant', async () => {
    selectResolvesTo([mapping()]);

    const mappings = await loadMerchantMappings();

    expect(mappings.find('Starbucks')).toBeUndefined();
  });

  it('handles an empty mappings table', async () => {
    selectResolvesTo(null);

    const mappings = await loadMerchantMappings();

    expect(mappings.find('Starbucks')).toBeUndefined();
  });
});

describe('loadManuallyTypedIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only the ids the user typed by hand', async () => {
    selectInResolvesTo([
      { plaid_transaction_id: 'tx-1', type_manually_set: true },
      { plaid_transaction_id: 'tx-2', type_manually_set: false },
      { plaid_transaction_id: 'tx-3', type_manually_set: null },
    ]);

    const ids = await loadManuallyTypedIds([
      { transaction_id: 'tx-1' },
      { transaction_id: 'tx-2' },
      { transaction_id: 'tx-3' },
    ]);

    expect([...ids]).toEqual(['tx-1']);
  });

  it('skips the query entirely when there are no transactions', async () => {
    selectInResolvesTo([]);

    const ids = await loadManuallyTypedIds([]);

    expect(ids.size).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('batches large id lists into multiple queries', async () => {
    selectInResolvesTo([]);

    await loadManuallyTypedIds(
      Array.from({ length: 450 }, (_, i) => ({ transaction_id: `tx-${i}` })),
    );

    // 450 ids at a batch size of 200 → 3 queries
    expect(mockIn).toHaveBeenCalledTimes(3);
    expect(mockIn.mock.calls[0][1]).toHaveLength(200);
    expect(mockIn.mock.calls[2][1]).toHaveLength(50);
  });
});

describe('resolveTransactionType', () => {
  it('prefers the type the user saved for the merchant', () => {
    expect(resolveTransactionType('transfer', mapping())).toBe('expense');
  });

  it('keeps the detected type when the mapping has no saved type', () => {
    expect(resolveTransactionType('transfer', mapping({ default_transaction_type: null }))).toBe('transfer');
  });

  it('keeps the detected type when there is no mapping', () => {
    expect(resolveTransactionType('transfer', undefined)).toBe('transfer');
  });
});
