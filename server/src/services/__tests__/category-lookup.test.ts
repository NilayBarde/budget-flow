import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake client handed to the service through its context
const mockSingle = vi.fn();
const mockEq: ReturnType<typeof vi.fn> = vi.fn(() => ({ eq: mockEq, single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const ctx = { db: { from: mockFrom }, userId: 'user-1' } as never;

const { getCategoryIdForType } = await import('../category-lookup.js');

describe('getCategoryIdForType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the category ID for "income"', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'cat-income-123' } });

    const result = await getCategoryIdForType(ctx, 'income');

    expect(result).toBe('cat-income-123');
    expect(mockFrom).toHaveBeenCalledWith('categories');
    expect(mockSelect).toHaveBeenCalledWith('id');
    expect(mockEq).toHaveBeenCalledWith('name', 'Income');
  });

  it("only looks at the user's own categories", async () => {
    mockSingle.mockResolvedValue({ data: { id: 'cat-income-123' } });

    await getCategoryIdForType(ctx, 'income');

    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('returns the category ID for "investment"', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'cat-invest-456' } });

    const result = await getCategoryIdForType(ctx, 'investment');

    expect(result).toBe('cat-invest-456');
    expect(mockEq).toHaveBeenCalledWith('name', 'Investment');
  });

  it('returns null for "expense" without querying the database', async () => {
    const result = await getCategoryIdForType(ctx, 'expense');

    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null for "transfer" without querying the database', async () => {
    const result = await getCategoryIdForType(ctx, 'transfer');

    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null for "return" without querying the database', async () => {
    const result = await getCategoryIdForType(ctx, 'return');

    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null when the database has no matching category', async () => {
    mockSingle.mockResolvedValue({ data: null });

    const result = await getCategoryIdForType(ctx, 'income');

    expect(result).toBeNull();
  });
});
