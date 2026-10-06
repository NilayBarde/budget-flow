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

/**
 * Read every row a query matches. `fetchPage(from, to)` must run the query with `.range(from, to)`
 * and a stable order (for example `.order('date').order('id')`): paging an unordered query can skip
 * or repeat rows between pages.
 */
export const fetchAllRows = async <T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> => {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * SUPABASE_PAGE_SIZE;
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) return rows;
  }

  throw new Error(`Read too many pages (more than ${MAX_PAGES * SUPABASE_PAGE_SIZE} rows); refusing to continue.`);
};
