/**
 * Backfill: make sure a credit card payment is never counted as spending, income or investing.
 * New syncs do this automatically; this covers rows imported before that existed.
 *
 *   1. Card bills typed as investments: rows whose raw bank text reads as a card bill
 *      ("Robinhood Ccb - Payment") but that Plaid labelled as a brokerage transfer.
 *   2. Card payment legs: the bank withdrawal and the card credit of the same payment are paired
 *      by amount and date, and both are typed as transfers.
 *
 * Dry run by default, writes nothing. Pass --apply to save the changes.
 *
 * Usage (from server/):
 *   npx tsx --env-file=.env src/scripts/reconcile-card-payments.ts            # preview
 *   npx tsx --env-file=.env src/scripts/reconcile-card-payments.ts --apply    # save
 */
import {
  reconcileCardPayments,
  retypeInvestmentsReadingAsCardBills,
  type PairedTransaction,
} from '../services/card-payment-reconciliation.js';

const print = (label: string, rows: PairedTransaction[], apply: boolean) => {
  console.log(`== ${label}: ${apply ? 'retyped' : 'would retype'} ${rows.length} transaction(s) as transfers ==`);
  const byTransition = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.previous_type} -> transfer`;
    byTransition.set(key, (byTransition.get(key) || 0) + 1);
  }
  for (const [key, count] of [...byTransition].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${key}`);
  }
  for (const row of [...rows].sort((a, b) => b.date.localeCompare(a.date))) {
    console.log(`${row.date}  ${row.previous_type.padEnd(10)} ${row.amount.toFixed(2).padStart(10)}  ${row.merchant_name || '(no name)'}`);
  }
  console.log('');
};

const main = async () => {
  const apply = process.argv.includes('--apply');

  // Bills first, so a bill typed as an investment is already a transfer when pairing runs.
  print('Card bills typed as investments', await retypeInvestmentsReadingAsCardBills({ apply }), apply);
  print('Card payment legs', await reconcileCardPayments({ sinceDate: null, apply }), apply);

  if (!apply) console.log('Dry run only. Re-run with --apply to save.');
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
