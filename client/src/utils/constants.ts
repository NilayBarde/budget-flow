export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
] as const;

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Unsplit expenses at or above this amount surface in the Dashboard's
// "Possible missed splits" card.
export const LARGE_UNSPLIT_THRESHOLD = 100;

// Shared Recharts tooltip styles used across chart components
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#252a3d',
  border: '1px solid #3a4160',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
} as const;

export const CHART_LABEL_STYLE = { color: '#f1f5f9', fontWeight: 500 } as const;
export const CHART_ITEM_STYLE = { color: '#cbd5e1' } as const;
