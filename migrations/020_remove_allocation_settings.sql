-- Remove app settings that were exclusively used by the AllocationBar component,
-- which has been removed from the Financial Plan page.
DELETE FROM app_settings WHERE key IN ('expected_monthly_income', 'net_worth_monthly_investments');
