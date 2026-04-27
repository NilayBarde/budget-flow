/**
 * Percent change from `previous` to `current`. Returns 0 when there is
 * no prior value to compare against — note that `0` here means "no
 * comparison possible," not "no change," and the UI should treat it
 * accordingly.
 */
export const percentChange = (current: number, previous: number): number => {
  return previous > 0 ? ((current - previous) / previous) * 100 : 0;
};
