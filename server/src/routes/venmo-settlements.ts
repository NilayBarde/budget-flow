import { Router, type Response } from 'express';
import { supabase } from '../db/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  loadUnsettledSplits,
  linkVenmoSettlement,
  unlinkVenmoSettlement,
  VenmoSettlementValidationError,
  VenmoTransactionNotFoundError,
} from '../services/venmo-settlement-reconciliation.js';

const router = Router();

/**
 * Answers a known link/unlink failure (missing transaction → 404, invalid request → 400) and
 * reports whether it did. Anything else, such as a database error, is left for the global 500.
 */
const sendSettlementError = (res: Response, error: unknown): boolean => {
  if (error instanceof VenmoTransactionNotFoundError) {
    res.status(404).json({ message: error.message });
    return true;
  }
  if (error instanceof VenmoSettlementValidationError) {
    res.status(400).json({ message: error.message });
    return true;
  }
  return false;
};

// Pending settlements, with the parent transaction's description for display.
router.get(
  '/pending',
  asyncHandler(async (_req, res) => {
    const unsettled = await loadUnsettledSplits();
    if (unsettled.length === 0) return res.json([]);

    const transactionIds = [...new Set(unsettled.map((s) => s.transactionId))];
    const { data, error } = await supabase
      .from('transactions')
      .select('id, merchant_display_name, merchant_name')
      .in('id', transactionIds);
    if (error) throw error;
    const descriptionById = new Map(
      ((data ?? []) as { id: string; merchant_display_name: string | null; merchant_name: string }[]).map((t) => [
        t.id,
        t.merchant_display_name || t.merchant_name,
      ]),
    );

    res.json(
      unsettled.map((s) => ({
        splitId: s.splitId,
        transactionId: s.transactionId,
        description: descriptionById.get(s.transactionId) ?? '',
        date: s.date,
        remainingAmount: s.remainingAmount,
      })),
    );
  }),
);

router.post(
  '/:venmoTransactionId/link',
  asyncHandler(async (req, res) => {
    const { venmoTransactionId } = req.params;
    const { splitIds } = req.body as { splitIds?: string[] };
    if (!Array.isArray(splitIds) || splitIds.length === 0) {
      return res.status(400).json({ message: 'splitIds is required' });
    }
    try {
      await linkVenmoSettlement(venmoTransactionId, splitIds);
    } catch (error) {
      if (sendSettlementError(res, error)) return;
      throw error;
    }
    res.status(204).send();
  }),
);

router.delete(
  '/:venmoTransactionId',
  asyncHandler(async (req, res) => {
    try {
      await unlinkVenmoSettlement(req.params.venmoTransactionId);
    } catch (error) {
      if (sendSettlementError(res, error)) return;
      throw error;
    }
    res.status(204).send();
  }),
);

export default router;
