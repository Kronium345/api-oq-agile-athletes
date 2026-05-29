import axios from 'axios';
export class ClarifaiServiceError extends Error {
    constructor(message, statusCode, clarifaiStatus) {
        super(message);
        this.name = 'ClarifaiServiceError';
        this.statusCode = statusCode;
        this.clarifaiStatus = clarifaiStatus;
    }
}
export function getClarifaiApiKey() {
    return process.env.FitnessOnePAT || process.env.CLARIFAI_API_KEY || '';
}
export function mapClarifaiAxiosError(error) {
    const axiosErr = error;
    const status = axiosErr.response?.status;
    const clarifaiStatus = axiosErr.response?.data?.status;
    const detail = clarifaiStatus?.description ||
        clarifaiStatus?.details ||
        (typeof axiosErr.response?.data === 'object'
            ? JSON.stringify(axiosErr.response?.data)
            : axiosErr.message);
    if (status === 402) {
        return new ClarifaiServiceError('Clarifai returned Payment Required (402). Your account has no credits or billing for the food recognition model. Add a payment method or upgrade your plan at clarifai.com, or use a new Personal Access Token with an active account.', 402, clarifaiStatus);
    }
    if (status === 401 || status === 403) {
        return new ClarifaiServiceError('Clarifai authentication failed. Check FitnessOnePAT / CLARIFAI_API_KEY on Render.', status, clarifaiStatus);
    }
    if (status === 429) {
        return new ClarifaiServiceError('Clarifai rate limit exceeded. Try again later or upgrade your plan.', 429, clarifaiStatus);
    }
    return new ClarifaiServiceError(`Clarifai request failed${status ? ` (${status})` : ''}: ${detail}`, status || 502, clarifaiStatus);
}
/** Reject oversized base64 payloads before calling Clarifai (saves quota and avoids huge requests). */
export function assertReasonableImageBase64(imageBase64) {
    const clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const maxChars = Number(process.env.FOOD_SCAN_MAX_BASE64_CHARS || 900000);
    if (clean.length > maxChars) {
        throw new ClarifaiServiceError(`Image is too large (${Math.round(clean.length / 1024)}KB base64). Maximum is about ${Math.round(maxChars / 1024)}KB. Resize or compress the photo in the app before scanning.`, 413);
    }
}
export async function postClarifaiJson(url, data) {
    const apiKey = getClarifaiApiKey();
    if (!apiKey) {
        throw new ClarifaiServiceError('Clarifai API key is not configured. Set FitnessOnePAT on Render.', 503);
    }
    try {
        const response = await axios.post(url, data, {
            headers: {
                Authorization: `Key ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: Number(process.env.CLARIFAI_TIMEOUT_MS || 60000),
            maxBodyLength: 15 * 1024 * 1024,
            maxContentLength: 15 * 1024 * 1024,
        });
        return response.data;
    }
    catch (error) {
        if (axios.isAxiosError(error)) {
            throw mapClarifaiAxiosError(error);
        }
        throw error;
    }
}
