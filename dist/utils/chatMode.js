/** Mobile AI Coach prepends this before the user message (see oq-agile-athletes). */
export const AI_COACH_FORMAT_MARKER = 'Format your reply in plain text only';
const MIND_CENTER_MARKERS = [
    /mind\s*center/i,
    /UK-focused\s+mental/i,
    /mental\s+wellness\s+hub/i,
    /anger\/anxiety/i,
    /NHS\s+111/i,
];
function normalizeMode(value) {
    if (typeof value !== 'string')
        return null;
    const v = value.trim().toLowerCase();
    if (v === 'coach')
        return 'coach';
    if (v === 'mind')
        return 'mind';
    return null;
}
export function hasBearerAuth(req) {
    const h = req.headers.authorization;
    return Boolean(h && h.startsWith('Bearer ') && h.split(' ')[1]?.trim());
}
export function isMindCenterPrompt(prompt) {
    return MIND_CENTER_MARKERS.some((re) => re.test(prompt));
}
export function isCoachFormatPrompt(prompt) {
    return (prompt.includes(AI_COACH_FORMAT_MARKER) ||
        /do not use markdown/i.test(prompt) ||
        /Generate a workout plan for/i.test(prompt));
}
/**
 * Resolve chat mode: explicit body/header wins; then Mind markers; then coach inference
 * (auth + coach format prefix); default mind for legacy clients.
 */
export function resolveChatMode(req, prompt) {
    const fromBody = normalizeMode(req.body?.mode);
    if (fromBody)
        return fromBody;
    const fromHeader = normalizeMode(req.headers['x-chat-mode']);
    if (fromHeader)
        return fromHeader;
    if (isMindCenterPrompt(prompt))
        return 'mind';
    if (isCoachFormatPrompt(prompt) && hasBearerAuth(req))
        return 'coach';
    return 'mind';
}
