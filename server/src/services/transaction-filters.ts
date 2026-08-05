export interface TaggedTransaction {
  tags?: { id: string }[] | null;
}

// Tag filtering stays in JS rather than SQL: a PostgREST inner-join filter
// (tags!inner + eq on tags.id) would also strip non-matching tags from the
// embedded tags array, changing what the client displays.
export const filterByTag = <T extends TaggedTransaction>(
  transactions: T[],
  tagId?: string
): T[] => {
  if (!tagId) return transactions;
  return transactions.filter(t => t.tags?.some(tag => tag.id === tagId));
};
