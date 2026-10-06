/**
 * Backfill: pair the two legs of every credit card payment in stored history and type them as
 * transfers, so a card payment is never counted as spending or income. New syncs do this
 * automatically; this covers rows imported before that existed.
 *
 * Dry run by default, writes nothing. Pass --apply to save the changes.
 *
 * Usage (from server/):
 *   npx tsx --env-file=.env src/scripts/reconcile-card-payments.ts            # preview
 *   npx tsx --env-file=.env src/scripts/reconcile-card-payments.ts --apply    # save
 */
import { reconcileCardPayments } from '../services/card-payment-reconciliation.js';

const main = async () => {
  const apply = process.argv.includes('--apply');
  const changed = await reconcileCardPayments({ sinceDate: null, apply });

  const byTransition = new Map<string, number>();
  for (const row of changed) {
    const key = `${row.previous_type} -> transfer`;
    byTransition.set(key, (byTransition.get(key) || 0) + 1);
  }

  console.log(`${apply ? 'Retyped' : 'Would retype'} ${changed.length} transaction(s) as transfers.`);
  for (const [key, count] of [...byTransition].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${key}`);
  }
  console.log('');
  for (const row of [...changed].sort((a, b) => b.date.localeCompare(a.date))) {
    console.log(`${row.date}  ${row.previous_type.padEnd(8)} ${row.amount.toFixed(2).padStart(10)}  ${row.merchant_name || '(no name)'}`);
  }
  if (!apply && changed.length > 0) console.log('\nDry run only. Re-run with --apply to save.');
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
