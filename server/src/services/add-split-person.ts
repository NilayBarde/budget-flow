export class AddSplitPersonError extends Error {}

const roundToCent = (n: number): number => Math.round(n * 100) / 100;

/**
 * Carves a new person's share out of the existing "my share" split amount, leaving every
 * other person's row untouched. Returns the new, reduced my-share amount.
 */
export const computeAddPersonSplit = (currentMyShareAmount: number, newPersonAmount: number): number => {
  if (newPersonAmount <= 0) throw new AddSplitPersonError('Amount must be greater than zero');
  const remaining = roundToCent(currentMyShareAmount - newPersonAmount);
  if (remaining < 0) throw new AddSplitPersonError("Amount exceeds what's left of your portion");
  return remaining;
};
