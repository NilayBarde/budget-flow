import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// env is loaded in index.ts

const supabaseUrl = process.env.SUPABASE_URL || '';
// Prefer the service-role key so the server bypasses RLS.
// Fall back to the anon key for backwards compatibility (removed with the auth middleware).
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('Warning: Supabase credentials not configured. Database operations will fail.');
}

export type Db = SupabaseClient;

// Bypasses RLS. Only for work with no signed-in user (Plaid webhooks, scripts) and for Plaid
// credentials and account inserts; such code must filter and stamp user_id itself.
export const supabaseAdmin: Db = createClient(supabaseUrl, serviceRoleKey);

/** @deprecated Use `req.db` in routes, or `supabaseAdmin` in webhooks and scripts. */
export const supabase = supabaseAdmin;

// A client acting as the signed-in user: every query runs under RLS with their JWT.
export const createUserClient = (accessToken: string): Db => {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for signed-in requests');
  }
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

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
    needs_reauth: boolean;
    reauth_detected_at: string | null;
    last_synced_at: string | null;
    last_sync_error: string | null;
    last_sync_error_at: string | null;
    /** Set while a re-linked Item is still resending history (migration 028) */
    relinked_at: string | null;
    /** "Keep" on an idle connection hides the disconnect suggestion until then (migration 029) */
    idle_snoozed_until: string | null;
    /** Derived from the token: manual or disconnected accounts (migration 030) */
    is_manual: boolean;
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
    original_description: string | null;
    category_id: string | null;
    transaction_type: 'income' | 'expense' | 'transfer' | 'investment' | 'return';
    is_split: boolean;
    split_dismissed: boolean;
    parent_transaction_id: string | null;
    is_recurring: boolean;
    needs_review: boolean;
    pending: boolean;
    plaid_category: { primary?: string; detailed?: string } | null;
    type_manually_set: boolean;
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
    is_my_share: boolean;
    created_at: string;
  };
  merchant_mappings: {
    id: string;
    original_name: string;
    display_name: string;
    default_category_id: string | null;
    default_transaction_type: string | null;
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
    source: 'manual' | 'detected';
    user_hidden: boolean;
    offset_merchant_name: string | null;
    offset_monthly_amount: number | null;
    created_at: string;
  };
};

