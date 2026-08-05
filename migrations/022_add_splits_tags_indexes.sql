-- Every stats/budget/transactions query embeds transaction_splits via
-- parent_transaction_id, which has no index (only a plain FK column). Tag
-- filtering and tag deletion look up transaction_tags by tag_id, which is
-- not the leading column of the (transaction_id, tag_id) primary key.
CREATE INDEX IF NOT EXISTS idx_transaction_splits_parent_transaction_id
  ON transaction_splits(parent_transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag_id
  ON transaction_tags(tag_id);
