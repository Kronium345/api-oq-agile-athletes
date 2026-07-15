import axios from 'axios';
export class FitveteError extends Error {
    constructor(message, statusCode, detail, retryAfterSeconds) {
        super(message);
        this.name = 'FitveteError';
        this.statusCode = statusCode;
        this.detail = detail;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
function getBaseUrl() {
    const raw = process.env.FITVETE_BASE_URL?.trim() ||
        'https://auth.fitvete.com/functions/v1/food-api';
    return raw.replace(/\/+$/, '');
}
function getApiKey() {
    const key = process.env.FITVETE_API_KEY?.trim();
    if (!key) {
        throw new FitveteError('FITVETE_API_KEY is not configured. Set it to enable FitVete nutrition.', 503);
    }
    return key;
}
function getTimeoutMs() {
    return Number(process.env.FITVETE_TIMEOUT_MS || 30000);
}
function parseErrorMessage(data) {
    if (!data || typeof data !== 'object')
        return undefined;
    const obj = data;
    if (typeof obj.message === 'string')
        return obj.message;
    if (typeof obj.detail === 'string')
        return obj.detail;
    if (typeof obj.error === 'string')
        return obj.error;
    return undefined;
}
function mapHttpError(status, detail, retryAfter) {
    if (status === 401) {
        return new FitveteError('FitVete authentication failed. Check FITVETE_API_KEY.', 401, detail);
    }
    if (status === 402) {
        return new FitveteError('FitVete daily quota exceeded. Upgrade your plan or try again tomorrow.', 402, detail);
    }
    if (status === 429) {
        return new FitveteError('FitVete rate limit hit. Please try again shortly.', 429, detail, retryAfter);
    }
    if (status === 400) {
        return new FitveteError(detail || 'Invalid FitVete search request.', 400, detail);
    }
    if (status && status >= 500) {
        return new FitveteError('FitVete nutrition service is unavailable.', 502, detail);
    }
    return new FitveteError(detail || 'FitVete request failed', status || 502, detail);
}
function normalizeFood(raw) {
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name)
        return null;
    const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0;
    return {
        name,
        calories: num(raw.calories),
        protein_g: num(raw.protein_g),
        carbs_g: num(raw.carbs_g),
        fat_g: num(raw.fat_g),
        confidence: num(raw.confidence),
        source: typeof raw.source === 'string' ? raw.source : undefined,
        attributes: Array.isArray(raw.attributes)
            ? raw.attributes.filter((a) => typeof a === 'string')
            : undefined,
    };
}
/**
 * GET /v1/search-foods — ~1 point. Prefer this after Gemini naming (Approach A).
 */
export async function searchFoods(query, number = Number(process.env.FITVETE_SEARCH_NUMBER || 3)) {
    const trimmed = query.trim();
    if (!trimmed) {
        return { number: 0, foods: [] };
    }
    const limit = Math.min(Math.max(1, number), 25);
    const url = `${getBaseUrl()}/v1/search-foods`;
    try {
        const response = await axios.get(url, {
            params: { query: trimmed, number: limit },
            headers: {
                'x-api-key': getApiKey(),
                Accept: 'application/json',
            },
            timeout: getTimeoutMs(),
            validateStatus: (s) => s >= 200 && s < 300,
        });
        const data = response.data;
        const foods = (data.foods || [])
            .map((f) => normalizeFood(f))
            .filter((f) => f !== null);
        return {
            number: typeof data.number === 'number' ? data.number : foods.length,
            source: data.source,
            foods,
        };
    }
    catch (error) {
        if (error instanceof FitveteError)
            throw error;
        if (axios.isAxiosError(error)) {
            const axiosErr = error;
            const status = axiosErr.response?.status;
            const detail = parseErrorMessage(axiosErr.response?.data);
            const retryHeader = axiosErr.response?.headers?.['retry-after'];
            const retryAfter = typeof retryHeader === 'string' ? Number(retryHeader) : undefined;
            if (axiosErr.code === 'ECONNABORTED' || axiosErr.message.includes('timeout')) {
                throw new FitveteError('FitVete request timed out.', 504, detail);
            }
            throw mapHttpError(status, detail, Number.isFinite(retryAfter) ? retryAfter : undefined);
        }
        throw new FitveteError(`FitVete request failed: ${error.message}`, 502);
    }
}
/** Highest FitVete confidence, else first result. */
export function pickBestFitveteFood(foods) {
    if (!foods.length)
        return null;
    return [...foods].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
}
export function isFitveteConfigured() {
    return Boolean(process.env.FITVETE_API_KEY?.trim());
}
