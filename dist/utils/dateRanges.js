export function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}
export function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}
export function startOfWeek(date = new Date()) {
    const d = startOfDay(date);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return startOfDay(start);
}
export function endOfWeek(date = new Date()) {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return endOfDay(end);
}
export function startOfMonth(year, month) {
    return new Date(year, month - 1, 1, 0, 0, 0, 0);
}
export function endOfMonth(year, month) {
    return endOfDay(new Date(year, month, 0));
}
export function parseYyyyMmDd(dateStr) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
        return null;
    }
    return d;
}
export function formatYyyyMmDd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
