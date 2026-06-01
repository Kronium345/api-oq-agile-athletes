import express from 'express';
import { getAllCategories, getAllQuestions, insertCategories, insertQuestions, normalizeQuestionForApi, } from "../models/quiz.js";
import { buildQuizPredictResponse } from "../services/quizPredict.js";
import { getQuizBootstrapStatus } from "../services/quizBootstrap.js";
import { DEFAULT_QUIZ_CATEGORIES } from "../utils/mentalClassifier.js";
import { QUIZ_KEY_ORDER, validateQuizFeatures } from "../utils/quizValidation.js";
const router = express.Router();
function sortQuestions(questions) {
    return [...questions].sort((a, b) => {
        const ai = QUIZ_KEY_ORDER[a.name] ?? 999;
        const bi = QUIZ_KEY_ORDER[b.name] ?? 999;
        return ai - bi;
    });
}
/** Mind Center readiness — questions + 4 outcome categories. */
router.get('/status', async (_req, res) => {
    try {
        const status = await getQuizBootstrapStatus();
        return res.json({
            success: true,
            ...status,
            hint: !status.readyForQuizUi
                ? 'Questions missing — restart server to auto-seed or POST /quiz/addQuestions with data/quizQuestions.json'
                : !status.readyForPredict
                    ? 'Categories missing or legacy — restart server to auto-repair or POST /quiz/addCategories'
                    : undefined,
        });
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ success: false, message: err.message });
    }
});
/** All 23 questions for Assessment UI (compatible with legacy Quiz.jsx). */
router.get('/quiz', async (_req, res) => {
    try {
        const questions = sortQuestions(await getAllQuestions()).map(normalizeQuestionForApi);
        return res.json(questions);
    }
    catch (error) {
        console.error('Failed to fetch questions:', error);
        return res.status(500).json({ error: 'Failed to fetch questions' });
    }
});
/** Four outcome rows (anger × anxiety matrix). */
router.get('/categories', async (_req, res) => {
    try {
        const categories = await getAllCategories();
        if (categories.length === 0) {
            return res.json(DEFAULT_QUIZ_CATEGORIES);
        }
        return res.json(categories);
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ success: false, message: err.message });
    }
});
router.post('/addQuestions', async (req, res) => {
    try {
        const questionsData = req.body;
        if (!Array.isArray(questionsData)) {
            return res.status(400).json({ msg: 'Request body must be an array of questions' });
        }
        const normalized = questionsData.map((q) => ({
            ...q,
            selected: q.selected ?? null,
        }));
        const result = await insertQuestions(normalized);
        return res.status(201).json({ msg: 'Questions added successfully', result });
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ msg: 'Failed to add questions', error: err.message });
    }
});
router.post('/addCategories', async (req, res) => {
    try {
        const categoriesData = req.body;
        if (!Array.isArray(categoriesData)) {
            return res.status(400).json({ msg: 'Request body must be an array of categories' });
        }
        const result = await insertCategories(categoriesData);
        return res.status(201).json({ msg: 'Categories added successfully', result });
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ msg: 'Failed to add categories', error: err.message });
    }
});
/**
 * Classify anger/anxiety assessment.
 * Body: { s3: 0|1, ..., s25: 0-3 } — all 23 keys required (matches Quiz.jsx submit).
 */
router.post('/predict', async (req, res) => {
    const features = req.body;
    if (!features || typeof features !== 'object' || Array.isArray(features)) {
        return res.status(400).json({
            msg: 'error',
            message: 'Request body must be a JSON object of question answers',
        });
    }
    const validation = validateQuizFeatures(features);
    if (!validation.valid) {
        return res.status(400).json({
            msg: 'error',
            message: 'All 23 assessment answers (s3–s25) are required',
            missing: validation.missing,
            invalid: validation.invalid,
        });
    }
    try {
        const response = await buildQuizPredictResponse(features);
        if (!response) {
            return res.status(404).json({
                msg: 'error',
                message: 'Category not found for prediction',
                hint: 'Ensure MongoDB has 4 categories (GET /quiz/status). Server auto-seeds on startup.',
            });
        }
        console.log('[quiz] predict', {
            label: response.label,
            category: response.category,
            angerSum: response.scores.angerSum,
            anxietySum: response.scores.anxietySum,
            source: response.source,
        });
        return res.json(response);
    }
    catch (error) {
        const err = error;
        console.error('[quiz] predict error:', err.message);
        return res.status(500).json({ msg: 'error', error: err.message });
    }
});
export default router;
