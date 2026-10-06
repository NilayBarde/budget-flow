// Months are 1 based (January is 1), matching the dashboard navigation and the stats API.
export const isCurrentMonth = (month: number, year: number, now: Date = new Date()): boolean =>
    month === now.getMonth() + 1 && year === now.getFullYear();
