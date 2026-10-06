import { describe, it, expect, vi } from 'vitest';
import { fetchAllRows, SUPABASE_PAGE_SIZE } from '../paginate.js';

// A fake table: returns the slice a PostgREST .range(from, to) would, capped like the real thing.
const tableOf = (rowCount: number) => {
  const rows = Array.from({ length: rowCount }, (_, i) => ({ id: i }));
  const fetchPage = vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));
  return { rows, fetchPage };
};

describe('fetchAllRows', () => {
  it('returns every row of a table larger than one page, in order', async () => {
    const { rows, fetchPage } = tableOf(2500);

    const result = await fetchAllRows(fetchPage);

    expect(result).toHaveLength(2500);
    expect(result.map(r => r.id)).toEqual(rows.map(r => r.id));
    expect(fetchPage.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('reads a table that is smaller than a page in a single request', async () => {
    const { fetchPage } = tableOf(37);

    expect(await fetchAllRows(fetchPage)).toHaveLength(37);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('does not stop early or loop on a table that is an exact multiple of the page size', async () => {
    const { fetchPage } = tableOf(SUPABASE_PAGE_SIZE * 2);

    const result = await fetchAllRows(fetchPage);

    expect(result).toHaveLength(SUPABASE_PAGE_SIZE * 2);
    // The third request comes back empty, which is how it knows to stop.
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('returns nothing for an empty table', async () => {
    expect(await fetchAllRows(tableOf(0).fetchPage)).toEqual([]);
  });

  it('treats a null result as empty instead of crashing', async () => {
    expect(await fetchAllRows(async () => ({ data: null, error: null }))).toEqual([]);
  });

  it('throws the database error instead of returning a partial table', async () => {
    const failure = { code: 'XX000', message: 'boom' };
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: SUPABASE_PAGE_SIZE }, (_, i) => ({ id: i })), error: null })
      .mockResolvedValueOnce({ data: null, error: failure });

    await expect(fetchAllRows(fetchPage)).rejects.toBe(failure);
  });

  it('drops a row that two pages both returned, when told how to tell rows apart', async () => {
    // A sync that inserts a row between two requests shifts every later offset by one, so the last
    // row of page one comes back again as the first row of page two. Counting it twice would
    // double a total, or make a transaction look like a duplicate of itself.
    const page1 = Array.from({ length: SUPABASE_PAGE_SIZE }, (_, i) => ({ id: i }));
    const page2 = [{ id: SUPABASE_PAGE_SIZE - 1 }, { id: SUPABASE_PAGE_SIZE }, { id: SUPABASE_PAGE_SIZE + 1 }];
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const result = await fetchAllRows<{ id: number }>(fetchPage, { keyOf: row => row.id });

    expect(result).toHaveLength(SUPABASE_PAGE_SIZE + 2);
    expect(new Set(result.map(r => r.id)).size).toBe(result.length);
  });

  it('keeps repeated rows when no key is given, since it cannot tell a repeat from a distinct row', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ x: 1 }, { x: 1 }], error: null });

    expect(await fetchAllRows(fetchPage)).toHaveLength(2);
  });

  it('gives up instead of looping forever if the server keeps returning full pages', async () => {
    const fetchPage = vi.fn(async () => ({
      data: Array.from({ length: SUPABASE_PAGE_SIZE }, (_, i) => ({ id: i })),
      error: null,
    }));

    await expect(fetchAllRows(fetchPage)).rejects.toThrow(/too many pages/i);
  });
});
