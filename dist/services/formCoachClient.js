export class FormCoachError extends Error {
    constructor(message, statusCode, details) {
        super(message);
        this.name = 'FormCoachError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
/** Legacy MVP id → catalog id */
const LEGACY_EXERCISE_ALIASES = {
    squat: 'back_squat',
};
export function normalizeExerciseId(raw, defaultId = 'back_squat') {
    const id = typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : defaultId;
    return LEGACY_EXERCISE_ALIASES[id] || id;
}
function catalogEntryId(entry) {
    if (typeof entry === 'string')
        return entry.trim().toLowerCase() || null;
    if (entry && typeof entry.id === 'string')
        return entry.id.trim().toLowerCase();
    return null;
}
function catalogEntryAvailable(entry) {
    if (typeof entry === 'string')
        return true;
    return entry.available !== false;
}
/** Build map of exercise id → enabled for analysis (from coach_enabled + exercises[].available). */
export function buildCoachEnabledMap(catalog) {
    const enabled = new Map();
    for (const entry of catalog.coach_enabled || []) {
        const id = catalogEntryId(entry);
        if (id)
            enabled.set(id, catalogEntryAvailable(entry));
    }
    for (const ex of catalog.exercises || []) {
        const id = ex.id?.trim().toLowerCase();
        if (!id)
            continue;
        if (!enabled.has(id)) {
            enabled.set(id, ex.available !== false);
        }
    }
    return enabled;
}
export function assertExerciseEnabled(exerciseId, catalog) {
    const enabled = buildCoachEnabledMap(catalog);
    if (!enabled.has(exerciseId)) {
        throw new FormCoachError(`Exercise "${exerciseId}" is not available for form analysis.`, 400);
    }
    if (enabled.get(exerciseId) === false) {
        throw new FormCoachError(`Exercise "${exerciseId}" is not enabled for coaching yet.`, 400);
    }
}
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const RETRYABLE_STATUSES = new Set([503, 502, 504]);
function getBaseUrl() {
    const raw = process.env.FORM_COACH_API_URL?.trim();
    if (!raw) {
        throw new FormCoachError('Form Coach service is not configured. Set FORM_COACH_API_URL on the server.', 503);
    }
    return raw.replace(/\/+$/, '');
}
function getTimeoutMs() {
    return Number(process.env.FORM_COACH_TIMEOUT_MS || 120000);
}
function parseErrorDetail(data) {
    if (data && typeof data === 'object') {
        if ('detail' in data) {
            const detail = data.detail;
            if (typeof detail === 'string')
                return detail;
            if (Array.isArray(detail)) {
                return detail
                    .map((item) => typeof item === 'object' && item && 'msg' in item
                    ? String(item.msg)
                    : String(item))
                    .join('; ');
            }
        }
        if ('error' in data && typeof data.error === 'string') {
            return data.error;
        }
    }
    return undefined;
}
function mapHttpError(status, detail) {
    const msg = detail || 'Form coach analysis failed';
    if (status === 400)
        return new FormCoachError(msg, 400, detail);
    if (status === 413)
        return new FormCoachError('Video exceeds the 50MB size limit.', 413, detail);
    if (status === 503) {
        return new FormCoachError('Form Coach service is starting up. Please try again in a moment.', 503, detail);
    }
    if (status >= 500) {
        return new FormCoachError('Form Coach analysis is temporarily unavailable.', 502, detail);
    }
    return new FormCoachError(msg, status, detail);
}
async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    catch (err) {
        const error = err;
        if (error.name === 'AbortError') {
            throw new FormCoachError('Form Coach analysis timed out. Try a shorter video.', 504);
        }
        throw new FormCoachError('Could not reach Form Coach service. It may be waking from sleep — try again.', 503, error.message);
    }
    finally {
        clearTimeout(timer);
    }
}
async function requestWithRetry(url, init) {
    const timeoutMs = getTimeoutMs();
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetchWithTimeout(url, init, timeoutMs);
            if (attempt === 0 && RETRYABLE_STATUSES.has(res.status)) {
                console.warn(`[form-coach] retrying after HTTP ${res.status}`);
                await new Promise((r) => setTimeout(r, 2000));
                continue;
            }
            return res;
        }
        catch (err) {
            if (err instanceof FormCoachError) {
                lastError = err;
                if (attempt === 0 && (err.statusCode === 503 || err.statusCode === 504)) {
                    console.warn('[form-coach] retrying after connection/timeout error');
                    await new Promise((r) => setTimeout(r, 2000));
                    continue;
                }
                throw err;
            }
            throw err;
        }
    }
    throw lastError || new FormCoachError('Form Coach request failed', 502);
}
let healthCache = null;
let exercisesCache = null;
export async function getFormCoachExercises(forceRefresh = false) {
    const cacheMs = Number(process.env.FORM_COACH_EXERCISES_CACHE_MS ||
        process.env.FORM_COACH_HEALTH_CACHE_MS ||
        60000);
    const now = Date.now();
    if (!forceRefresh && exercisesCache && exercisesCache.expiresAt > now) {
        return exercisesCache.data;
    }
    const res = await fetchWithTimeout(`${getBaseUrl()}/exercises`, { method: 'GET' }, 15000);
    if (!res.ok) {
        const detail = parseErrorDetail(await res.json().catch(() => null));
        throw mapHttpError(res.status, detail);
    }
    const data = (await res.json());
    exercisesCache = { data, expiresAt: now + cacheMs };
    return data;
}
export async function validateExerciseForAnalysis(exerciseId) {
    const catalog = await getFormCoachExercises();
    assertExerciseEnabled(exerciseId, catalog);
}
export async function getFormCoachHealth(forceRefresh = false) {
    const cacheMs = Number(process.env.FORM_COACH_HEALTH_CACHE_MS || 30000);
    const now = Date.now();
    if (!forceRefresh && healthCache && healthCache.expiresAt > now) {
        return healthCache.data;
    }
    const res = await fetchWithTimeout(`${getBaseUrl()}/health`, { method: 'GET' }, 15000);
    if (!res.ok) {
        const detail = parseErrorDetail(await res.json().catch(() => null));
        throw mapHttpError(res.status, detail);
    }
    const data = (await res.json());
    healthCache = { data, expiresAt: now + cacheMs };
    return data;
}
export async function checkFormCoachReady() {
    try {
        const health = await getFormCoachHealth();
        const statusOk = health.status === 'ok' || health.status === 'healthy';
        const hasExercises = Array.isArray(health.exercises) && health.exercises.length > 0;
        return statusOk && hasExercises;
    }
    catch {
        return false;
    }
}
export function assertVideoSize(byteLength) {
    if (byteLength > MAX_VIDEO_BYTES) {
        throw new FormCoachError('Video exceeds the 50MB size limit.', 413);
    }
    if (byteLength === 0) {
        throw new FormCoachError('Video file is empty.', 400);
    }
}
export async function analyzeFormVideo(params) {
    assertVideoSize(params.videoBuffer.length);
    const form = new FormData();
    const blob = new Blob([new Uint8Array(params.videoBuffer)], {
        type: params.contentType || 'video/mp4',
    });
    form.append('video', blob, params.filename);
    form.append('exercise', params.exercise || 'back_squat');
    const res = await requestWithRetry(`${getBaseUrl()}/analyze-form`, {
        method: 'POST',
        body: form,
    });
    if (!res.ok) {
        const detail = parseErrorDetail(await res.json().catch(() => null));
        throw mapHttpError(res.status, detail);
    }
    return (await res.json());
}
export async function fetchVideoFromUrl(videoUrl) {
    let parsed;
    try {
        parsed = new URL(videoUrl);
    }
    catch {
        throw new FormCoachError('Invalid videoUrl.', 400);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new FormCoachError('videoUrl must use http or https.', 400);
    }
    const res = await fetchWithTimeout(videoUrl, { method: 'GET' }, 60000);
    if (!res.ok) {
        throw new FormCoachError('Could not download video from videoUrl.', 400);
    }
    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_VIDEO_BYTES) {
        throw new FormCoachError('Video exceeds the 50MB size limit.', 413);
    }
    const arrayBuffer = await res.arrayBuffer();
    assertVideoSize(arrayBuffer.byteLength);
    const pathname = parsed.pathname;
    const filename = pathname.split('/').pop() || 'video.mp4';
    const contentType = res.headers.get('content-type') || 'video/mp4';
    return {
        buffer: Buffer.from(arrayBuffer),
        filename,
        contentType,
    };
}
export { MAX_VIDEO_BYTES };
