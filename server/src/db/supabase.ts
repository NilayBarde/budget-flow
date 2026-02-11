import { createClient } from '@supabase/supabase-js';

// env is loaded in index.ts

const supabaseUrl = process.env.SUPABASE_URL || '';
// Prefer the service-role key so the server bypasses RLS.
// Fall back to the anon key for backwards compatibility.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Warning: Supabase credentials not configured. Database operations will fail.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export type Database = {
  accounts: {
    id: string;
    user_id: string;
    plaid_item_id: string;
    plaid_access_token: string;
    institution_name: string;
    account_name: string;
    account_type: string;
    created_at: string;
  };
  transactions: {
    id: string;
    account_id: string;
    plaid_transaction_id: string | null;
    csv_reference: string | null;
    amount: number;
    date: string;
    merchant_name: string;
    merchant_display_name: string | null;
    category_id: string | null;
    is_split: boolean;
    parent_transaction_id: string | null;
    is_recurring: boolean;
    notes: string | null;
    created_at: string;
  };
  categories: {
    id: string;
    name: string;
    icon: string;
    color: string;
    is_default: boolean;
  };
  budget_goals: {
    id: string;
    category_id: string;
    month: number;
    year: number;
    limit_amount: number;
    created_at: string;
  };
  transaction_splits: {
    id: string;
    parent_transaction_id: string;
    amount: number;
    description: string;
    created_at: string;
  };
  merchant_mappings: {
    id: string;
    original_name: string;
    display_name: string;
    default_category_id: string | null;
    created_at: string;
  };
  tags: {
    id: string;
    name: string;
    color: string;
    created_at: string;
  };
  transaction_tags: {
    transaction_id: string;
    tag_id: string;
  };
  recurring_transactions: {
    id: string;
    merchant_display_name: string;
    average_amount: number;
    frequency: 'weekly' | 'monthly' | 'yearly';
    last_seen: string;
    is_active: boolean;
    created_at: string;
  };
};

