import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPendingVenmoSettlements, linkVenmoSettlement, unlinkVenmoSettlement } from '../api';

describe('venmo settlements api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getPendingVenmoSettlements fetches the pending list', async () => {
    const payload = [{ splitId: 's1', transactionId: 't1', description: 'Dinner', date: '2026-08-01', remainingAmount: 25 }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await getPendingVenmoSettlements();

    expect(result).toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/venmo-settlements/pending'), expect.anything());
  });

  it('linkVenmoSettlement posts the chosen split ids', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await linkVenmoSettlement('venmo-1', ['split-1', 'split-2']);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/venmo-settlements/venmo-1/link'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ splitIds: ['split-1', 'split-2'] }) }),
    );
  });

  it('unlinkVenmoSettlement sends a DELETE', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await unlinkVenmoSettlement('venmo-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/venmo-settlements/venmo-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
