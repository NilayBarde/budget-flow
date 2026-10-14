// app_settings keys the server manages for itself. Users can't write them through PUT /settings:
// a far-future refresh time would stop recurring detection, and the setup marker decides whether
// a user gets the default categories.
export const RECURRING_REFRESHED_KEY = 'recurring_last_refreshed';
export const SETUP_MARKER_KEY = 'user_defaults_seeded';

export const SERVER_MANAGED_SETTING_KEYS: ReadonlySet<string> = new Set([RECURRING_REFRESHED_KEY, SETUP_MARKER_KEY]);
