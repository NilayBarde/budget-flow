import { describe, it, expect } from 'vitest';
import { filterByTag } from '../transaction-filters.js';

const tx = (id: string, tagIds: string[] | null | undefined) => ({
  id,
  tags: tagIds ? tagIds.map(t => ({ id: t, name: `tag-${t}`, color: '#fff' })) : tagIds,
});

describe('filterByTag', () => {
  it('returns only transactions carrying the tag', () => {
    const list = [tx('a', ['t1']), tx('b', ['t2']), tx('c', ['t1', 't2'])];
    const result = filterByTag(list, 't1');
    expect(result.map(t => t.id)).toEqual(['a', 'c']);
  });

  it('passes everything through when no tag id is given', () => {
    const list = [tx('a', ['t1']), tx('b', null)];
    expect(filterByTag(list, undefined)).toEqual(list);
  });

  it('handles transactions with missing or null tags arrays', () => {
    const list = [tx('a', null), tx('b', undefined), tx('c', ['t1'])];
    expect(filterByTag(list, 't1').map(t => t.id)).toEqual(['c']);
  });

  it('keeps all tags on matched transactions (no stripping)', () => {
    const list = [tx('a', ['t1', 't2'])];
    const result = filterByTag(list, 't1');
    expect(result[0].tags).toHaveLength(2);
  });

  it('returns empty when nothing matches', () => {
    expect(filterByTag([tx('a', ['t2'])], 't1')).toEqual([]);
  });
});
