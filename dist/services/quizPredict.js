import { getCategoryByLabel, getCategoryByName, } from "../models/quiz.js";
import { DEFAULT_QUIZ_CATEGORIES, getPrediction, } from "../utils/mentalClassifier.js";
export async function resolveQuizCategory(prediction) {
    const byLabel = await getCategoryByLabel(prediction.label);
    if (byLabel) {
        return { category: byLabel, source: 'mongodb' };
    }
    const byName = await getCategoryByName(prediction.prediction);
    if (byName) {
        return { category: byName, source: 'mongodb' };
    }
    const fallback = DEFAULT_QUIZ_CATEGORIES.find((c) => c.label === prediction.label);
    if (fallback) {
        return { category: { ...fallback }, source: 'default' };
    }
    return null;
}
export async function buildQuizPredictResponse(features) {
    const prediction = getPrediction(features);
    const resolved = await resolveQuizCategory(prediction);
    if (!resolved) {
        return null;
    }
    const { category, source } = resolved;
    return {
        msg: 'success',
        prediction: category.category,
        label: prediction.label,
        category: category.category,
        description: category.description,
        suggestion: category.suggestion,
        scores: prediction.scores,
        source,
    };
}
