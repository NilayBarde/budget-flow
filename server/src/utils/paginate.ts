// Supabase (PostgREST) returns at most 1000 rows from a SELECT and says nothing when it cuts the
// result short. A query that reads many months of transactions therefore returns a partial table,
// and any total built from it is silently wrong, differently each time because the rows that are cut
// depend on the order the database happens to return them. Read such tables page by page with this.
export const SUPABASE_PAGE_SIZE = 1000;

// A table this large would be a bug elsewhere; stopping here keeps a misbehaving server from
// looping forever. 200 pages is 200,000 rows.
const MAX_PAGES = 200;

interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

interface FetchAllOptions<T> {
  /**
   * Identifies a row (its id). Offset paging is not a snapshot: if a sync inserts a row between two
   * requests, every later offset shifts and the row at the end of one page comes back again at the
   * start of the next. With a key, a repeated row is kept once, so a total is not doubled and a
   * transaction does not look like a duplicate of itself.
   */
  keyOf?: (row: T) => string | number;
}

/**
 * Read every row a query matches. `fetchPage(from, to)` must run the query with `.range(from, to)`
 * and a stable order (for example `.order('date').order('id')`): paging an unordered query can skip
 * or repeat rows between pages.
 */
export const fetchAllRows = async <T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: FetchAllOptions<T> = {},
): Promise<T[]> => {
  const { keyOf } = options;
  const rows: T[] = [];
  const seen = new Set<string | number>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * SUPABASE_PAGE_SIZE;
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;

    const batch = data ?? [];
    for (const row of batch) {
      if (keyOf) {
        const key = keyOf(row);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      rows.push(row);
    }
    // The page length, not the kept length: a dropped repeat must not look like the last page.
    if (batch.length < SUPABASE_PAGE_SIZE) return rows;
  }

  throw new Error(`Read too many pages (more than ${MAX_PAGES * SUPABASE_PAGE_SIZE} rows); refusing to continue.`);
};
