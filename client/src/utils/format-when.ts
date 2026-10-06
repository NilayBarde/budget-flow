const DAY_MS = 86_400_000;

// How long ago a timestamp was, in whole days: "today", "1 day ago", "5 days ago". A missing
// timestamp reads as "never".
export const formatWhen = (iso: string | null | undefined, now: number = Date.now()): string => {
  if (!iso) return 'never';
  const days = Math.floor((now - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
};
