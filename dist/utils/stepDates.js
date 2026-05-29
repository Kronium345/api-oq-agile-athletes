/** Step dates use UTC calendar days (YYYY-MM-DD), consistent across streaks and weekly totals. */
export function todayUtc() {
    return new Date().toISOString().slice(0, 10);
}
export function addDaysUtc(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
/** Monday 00:00 UTC of the week containing `dateStr` (or today). */
export function weekStartMondayUtc(dateStr = todayUtc()) {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    const dow = d.getUTCDay();
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    d.setUTCDate(d.getUTCDate() - daysFromMonday);
    return d.toISOString().slice(0, 10);
}
/** Inclusive list of YYYY-MM-DD from start through end. */
export function dateRangeInclusive(start, end) {
    const out = [];
    let cur = start;
    while (cur <= end) {
        out.push(cur);
        cur = addDaysUtc(cur, 1);
    }
    return out;
}
/** ~60 days lookback for streak calculation. */
export function streakLookbackStartUtc(today = todayUtc()) {
    return addDaysUtc(today, -60);
}
