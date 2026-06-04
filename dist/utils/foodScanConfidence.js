/** Minimum confidence to treat vision primary as reliable for meal totals. */
export const PRIMARY_MIN_CONFIDENCE = Number(process.env.FOOD_SCAN_PRIMARY_MIN_CONFIDENCE || 0.5);
/** Minimum confidence to include a label in `alternates` (aligns with Python MIN_CONFIDENCE). */
export const ALTERNATE_MIN_CONFIDENCE = Number(process.env.FOOD_SCAN_ALTERNATE_MIN_CONFIDENCE || 0.15);
/** Fetch USDA data for alternates at or above this (saves calls for noisy low scores). */
export const ALTERNATE_NUTRITION_MIN_CONFIDENCE = Number(process.env.FOOD_SCAN_ALTERNATE_NUTRITION_MIN || 0.25);
export function getIdentificationQuality(confidence) {
    if (confidence >= PRIMARY_MIN_CONFIDENCE)
        return 'high';
    if (confidence >= ALTERNATE_MIN_CONFIDENCE)
        return 'low';
    return 'none';
}
