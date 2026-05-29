import express from 'express';
import { getCategoryByName, getAllQuestions, insertCategories, insertQuestions } from "../models/quiz.js";
import { getPrediction } from "../utils/mentalClassifier.js";
const router = express.Router();
router.get('/quiz', async (_req, res) => {
    try {
        const questions = await getAllQuestions();
        return res.json(questions);
    }
    catch (error) {
        console.error('Failed to fetch questions:', error);
        return res.status(500).json({ error: 'Failed to fetch questions' });
    }
});
router.post('/addQuestions', async (req, res) => {
    try {
        const questionsData = req.body;
        if (!Array.isArray(questionsData)) {
            return res.status(400).json({ msg: 'Request body must be an array of questions' });
        }
        const result = await insertQuestions(questionsData);
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
router.post('/predict', async (req, res) => {
    const features = req.body;
    console.log('Features for prediction:', features);
    try {
        const prediction = getPrediction(features);
        console.log('Calculated prediction:', prediction.prediction);
        const category = await getCategoryByName(prediction.prediction);
        console.log('Category from DB:', category);
        if (category) {
            return res.json({
                msg: 'success',
                prediction: prediction.prediction,
                label: prediction.label,
                category: category.category,
                description: category.description,
                suggestion: category.suggestion,
            });
        }
        return res.status(404).json({
            msg: 'Category not found',
            prediction: prediction.prediction,
            label: prediction.label,
            hint: 'Seed categories with POST /quiz/addCategories',
        });
    }
    catch (error) {
        const err = error;
        return res.status(500).json({ msg: 'error', error: err.message });
    }
});
export default router;
