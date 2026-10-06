import { describe, it, expect } from 'vitest';
import { recurringUnmarkUpdate } from '../recurring-unmark.js';

describe('recurringUnmarkUpdate', () => {
  it('only deactivates detected series so detection can still find them', () => {
    expect(recurringUnmarkUpdate('detected')).toEqual({ is_active: false });
  });

  it('hides manual series so detection does not resurrect them', () => {
    expect(recurringUnmarkUpdate('manual')).toEqual({ is_active: false, user_hidden: true });
  });

  it('treats a missing source as detected', () => {
    expect(recurringUnmarkUpdate(null)).toEqual({ is_active: false });
    expect(recurringUnmarkUpdate(undefined)).toEqual({ is_active: false });
  });
});
