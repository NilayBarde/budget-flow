-- Data shaped like the single-user app's today, written before 030 runs.
INSERT INTO accounts (id, plaid_item_id, plaid_access_token, plaid_cursor, institution_name, account_name, account_type, plaid_account_id)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'item-1', 'access-sandbox-1', 'cursor-abc', 'Chase', 'Checking', 'checking', 'plaid-acct-1'),
  ('10000000-0000-0000-0000-000000000002', 'manual-2', 'manual', NULL, 'Cash', 'Wallet', 'cash', NULL);

INSERT INTO csv_imports (id, account_id, file_name, transaction_count)
VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'wallet.csv', 1);

INSERT INTO transactions (id, account_id, plaid_transaction_id, amount, date, merchant_name, category_id, import_id)
VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'plaid-tx-1', 42.50, '2026-10-01', 'Blue Bottle',
    (SELECT id FROM categories WHERE name = 'Dining'), NULL),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', NULL, 12.00, '2026-10-02', 'Farmers Market',
    (SELECT id FROM categories WHERE name = 'Groceries'), '20000000-0000-0000-0000-000000000001');

INSERT INTO transaction_splits (parent_transaction_id, amount, description, is_my_share)
VALUES ('30000000-0000-0000-0000-000000000001', 21.25, 'my half', TRUE);

INSERT INTO tags (id, name, color) VALUES ('40000000-0000-0000-0000-000000000001', 'Trip', '#ff0000');
INSERT INTO transaction_tags (transaction_id, tag_id)
VALUES ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001');

INSERT INTO merchant_mappings (original_name, display_name) VALUES ('BLUE BOTTLE #12', 'Blue Bottle');
INSERT INTO recurring_transactions (merchant_display_name, average_amount, frequency, last_seen)
VALUES ('Netflix', 15.49, 'monthly', '2026-10-01');
INSERT INTO budget_goals (category_id, month, year, limit_amount)
VALUES ((SELECT id FROM categories WHERE name = 'Dining'), 10, 2026, 300);
INSERT INTO app_settings (key, value) VALUES ('recurring_last_refreshed', '2026-10-01T00:00:00Z');
