import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MerchantMapping } from '../merchant-mappings.js';

// Mock the supabase module before importing the module under test
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('../../db/supabase.js', () => ({
  supabase: { from: mockFrom },
}));

// Import AFTER the mock is set up
const { loadMerchantMappings, resolveTransactionType } = await import('../merchant-mappings.js');

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
    mockSelect.mockResolvedValue({ data: [mapping()] });

    const mappings = await loadMerchantMappings();

    expect(mappings.find('empower finance transfer')?.display_name).toBe('Empower');
  });

  it('falls back to the next candidate name when the first has no mapping', async () => {
    mockSelect.mockResolvedValue({ data: [mapping()] });

    const mappings = await loadMerchantMappings();

    // Plaid often returns no merchant_name, so the mapping was stored under `name`
    expect(mappings.find(null, 'EMPOWER FINANCE TRANSFER')?.display_name).toBe('Empower');
    expect(mappings.find(undefined, '')).toBeUndefined();
  });

  it('returns undefined for an unknown merchant', async () => {
    mockSelect.mockResolvedValue({ data: [mapping()] });

    const mappings = await loadMerchantMappings();

    expect(mappings.find('Starbucks')).toBeUndefined();
  });

  it('handles an empty mappings table', async () => {
    mockSelect.mockResolvedValue({ data: null });

    const mappings = await loadMerchantMappings();

    expect(mappings.find('Starbucks')).toBeUndefined();
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
