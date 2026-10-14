import { describe, it, expect } from 'vitest';
import { pickFields } from '../pickFields.js';

describe('pickFields', () => {
  it('keeps only the allowed fields that are present', () => {
    expect(pickFields({ name: 'Food', color: '#fff', is_default: false, id: 'x' }, ['name', 'icon', 'color'])).toEqual({
      name: 'Food',
      color: '#fff',
    });
  });

  it('keeps an explicit null, which clears a field', () => {
    expect(pickFields({ color: null }, ['color'])).toEqual({ color: null });
  });

  it('is empty for a missing or non-object body', () => {
    expect(pickFields(undefined, ['name'])).toEqual({});
    expect(pickFields('name', ['name'])).toEqual({});
  });
});
