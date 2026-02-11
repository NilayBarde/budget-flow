import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase module before importing the module under test
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('../../db/supabase.js', () => ({
  supabase: { from: mockFrom },
}));

// Import AFTER the mock is set up
const { getCategoryIdForType } = await import('../category-lookup.js');

describe('getCategoryIdForType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the category ID for "income"', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'cat-income-123' } });

    const result = await getCategoryIdForType('income');

    expect(result).toBe('cat-income-123');
    expect(mockFrom).toHaveBeenCalledWith('categories');
    expect(mockSelect).toHaveBeenCalledWith('id');
    expect(mockEq).toHaveBeenCalledWith('name', 'Income');
  });

  it('returns the category ID for "investment"', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'cat-invest-456' } });

    const result = await getCategoryIdForType('investment');

    expect(result).toBe('cat-invest-456');
    expect(mockEq).toHaveBeenCalledWith('name', 'Investment');
  });

  it('returns null for "expense" without querying the database', async () => {
    const result = await getCategoryIdForType('expense');

    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null for "transfer" without querying the database', async () => {
    const result = await getCategoryIdForType('transfer');

    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null for "return" without querying the database', async () => {
    const result = await getCategoryIdForType('return');

    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null when the database has no matching category', async () => {
    mockSingle.mockResolvedValue({ data: null });

    const result = await getCategoryIdForType('income');

    expect(result).toBeNull();
  });
});
