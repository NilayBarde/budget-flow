-- Deleting a recurring series now clears is_recurring on its transactions. Series the user
-- hid before that change (user_hidden = true) left those flags set, so their transactions
-- still show the Recurring badge and match the Recurring filter. Clear them once.
-- Safe to re-run: it only touches rows that are still flagged.

UPDATE transactions t
SET is_recurring = false
FROM recurring_transactions r
WHERE r.user_hidden = true
  AND t.is_recurring = true
  AND COALESCE(t.merchant_display_name, t.merchant_name) = r.merchant_display_name;
