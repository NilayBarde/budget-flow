// Months are 1 based (January is 1), matching the dashboard navigation and the stats API.
export const isCurrentMonth = (month: number, year: number, now: Date = new Date()): boolean =>
    month === now.getMonth() + 1 && year === now.getFullYear();

const MIN_YEAR = 1970;
const MAX_YEAR = 2200;

const isValidMonthYear = (month: number, year: number): boolean =>
    Number.isInteger(month) && month >= 1 && month <= 12
    && Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;

export interface MonthFromUrl {
    month: number;
    year: number;
    /** Set only for a ?date=YYYY-MM-DD link. */
    date?: string;
}

/**
 * The month a Transactions link points at: ?date=YYYY-MM-DD wins, then ?month=&year=.
 * Returns null when neither is present or valid, so a bad link falls back to the selected month
 * instead of putting an impossible month (13, NaN) into the app wide selection.
 */
export const monthFromSearchParams = (params: URLSearchParams): MonthFromUrl | null => {
    const date = params.get('date');
    if (date) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
        if (!match) return null;
        const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
        const real = new Date(year, month - 1, day);
        // Reject dates that roll over, such as 2025-02-31.
        if (isValidMonthYear(month, year) && real.getMonth() === month - 1 && real.getDate() === day) {
            return { month, year, date };
        }
        return null;
    }

    const monthParam = params.get('month');
    const yearParam = params.get('year');
    if (monthParam && yearParam) {
        const month = Number(monthParam);
        const year = Number(yearParam);
        if (isValidMonthYear(month, year)) return { month, year };
    }
    return null;
};
