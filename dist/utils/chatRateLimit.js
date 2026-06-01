const windows = new Map();
const WINDOW_MS = 60000;
const MAX_REQUESTS = Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE || 15);
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}
/** Token-bucket style limit for POST /chat/generate (replaces Arcjet for this route). */
export function chatGenerateRateLimiter(req, res, next) {
    if (process.env.CHAT_RATE_LIMIT_DISABLED === 'true') {
        next();
        return;
    }
    const ip = getClientIp(req);
    const now = Date.now();
    let state = windows.get(ip);
    if (!state || now >= state.resetAt) {
        state = { count: 0, resetAt: now + WINDOW_MS };
        windows.set(ip, state);
    }
    state.count += 1;
    if (state.count > MAX_REQUESTS) {
        res.status(429).json({
            error: 'Too many AI requests. Please wait a minute and try again.',
            retryAfterSeconds: Math.ceil((state.resetAt - now) / 1000),
        });
        return;
    }
    next();
}
