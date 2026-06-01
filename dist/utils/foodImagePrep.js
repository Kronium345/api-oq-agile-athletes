import sharp from 'sharp';
import { ClarifaiServiceError, getFoodScanMaxBase64Chars } from "../services/clarifaiClient.js";
function getMaxEdgePx() {
    return Number(process.env.FOOD_SCAN_MAX_EDGE_PX || 1280);
}
function getInitialJpegQuality() {
    const q = Number(process.env.FOOD_SCAN_JPEG_QUALITY || 82);
    return Math.min(95, Math.max(40, q));
}
/**
 * Shrinks oversized food-scan photos so they pass FOOD_SCAN_MAX_BASE64_CHARS.
 * Returns input unchanged when already within the limit.
 */
export async function prepareFoodScanBase64(cleanBase64) {
    const maxChars = getFoodScanMaxBase64Chars();
    if (cleanBase64.length <= maxChars) {
        return cleanBase64;
    }
    let inputBuffer;
    try {
        inputBuffer = Buffer.from(cleanBase64, 'base64');
    }
    catch {
        throw new ClarifaiServiceError('Invalid image data.', 422);
    }
    if (inputBuffer.length === 0) {
        throw new ClarifaiServiceError('Invalid image data.', 422);
    }
    let quality = getInitialJpegQuality();
    let maxEdge = getMaxEdgePx();
    let working = inputBuffer;
    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            working = await sharp(working)
                .rotate()
                .resize({
                width: maxEdge,
                height: maxEdge,
                fit: 'inside',
                withoutEnlargement: true,
            })
                .jpeg({ quality, mozjpeg: true })
                .toBuffer();
        }
        catch {
            throw new ClarifaiServiceError('Could not process image. Use a JPEG or PNG photo.', 422);
        }
        const outBase64 = working.toString('base64');
        if (outBase64.length <= maxChars) {
            console.log('[food-scan] compressed image', {
                fromKb: Math.round(cleanBase64.length / 1024),
                toKb: Math.round(outBase64.length / 1024),
                maxEdge,
                quality,
            });
            return outBase64;
        }
        quality = Math.max(40, quality - 10);
        maxEdge = Math.max(480, Math.round(maxEdge * 0.85));
    }
    throw new ClarifaiServiceError(`Image is still too large after compression. Maximum is about ${Math.round(maxChars / 1024)}KB. Try a smaller photo.`, 413);
}
