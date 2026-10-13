import { supabaseAdmin } from '../db/supabase.js';

// The categories every new user starts with (the same set supabase-schema.sql seeds).
export const DEFAULT_CATEGORIES = [
  { name: 'Housing', icon: 'home', color: '#0ea5e9' },
  { name: 'Dining', icon: 'utensils', color: '#f97316' },
  { name: 'Groceries', icon: 'shopping-cart', color: '#22c55e' },
  { name: 'Transportation', icon: 'car', color: '#3b82f6' },
  { name: 'Entertainment', icon: 'film', color: '#a855f7' },
  { name: 'Shopping', icon: 'shopping-bag', color: '#ec4899' },
  { name: 'Utilities', icon: 'zap', color: '#eab308' },
  { name: 'Subscriptions', icon: 'repeat', color: '#6366f1' },
  { name: 'Travel', icon: 'plane', color: '#14b8a6' },
  { name: 'Healthcare', icon: 'heart-pulse', color: '#ef4444' },
  { name: 'Income', icon: 'wallet', color: '#10b981' },
  { name: 'Investment', icon: 'trending-up', color: '#8b5cf6' },
  { name: 'Other', icon: 'more-horizontal', color: '#64748b' },
] as const;

// The app_settings key recording that a user has had their defaults (migration 030 sets it for the
// owner). A marker rather than "has no categories", so deleting every category doesn't bring the
// defaults back.
export const SETUP_MARKER_KEY = 'user_defaults_seeded';

// Seeds a user's default categories the first time they sign in. Runs as the service role because
// it happens before anything of theirs exists, so it stamps user_id itself. Safe to call repeatedly
// and concurrently: existing names and markers are skipped, and the marker is written only after
// the categories, so a failed seed is retried on the next request.
export const ensureUserSetup = async (userId: string): Promise<void> => {
  const { data: marker, error } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', SETUP_MARKER_KEY)
    .maybeSingle();
  if (error) throw error;
  if (marker) return;

  const { error: seedError } = await supabaseAdmin
    .from('categories')
    .upsert(
      DEFAULT_CATEGORIES.map(category => ({ ...category, is_default: true, user_id: userId })),
      { onConflict: 'user_id,name', ignoreDuplicates: true },
    );
  if (seedError) throw seedError;

  const { error: markerError } = await supabaseAdmin
    .from('app_settings')
    .upsert(
      { user_id: userId, key: SETUP_MARKER_KEY, value: 'true' },
      { onConflict: 'user_id,key', ignoreDuplicates: true },
    );
  if (markerError) throw markerError;
};
