import express, { Request, Response } from 'express';
import { getCategoryByName, getAllQuestions, insertCategories, insertQuestions } from '../models/quiz.ts';
import { getQuizBootstrapStatus } from '../services/quizBootstrap.ts';
import { DEFAULT_QUIZ_CATEGORIES, getPrediction } from '../utils/mentalClassifier.ts';

const router = express.Router();

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getQuizBootstrapStatus();
    return res.json({
      success: true,
      ...status,
      hint:
        status.questionsCount === 0
          ? 'POST /quiz/addQuestions with your app question array (from components/Quiz/questions.js)'
          : undefined,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/quiz', async (_req: Request, res: Response) => {
  try {
    const questions = await getAllQuestions();
    return res.json(questions);
  } catch (error: unknown) {
    console.error('Failed to fetch questions:', error);
    return res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

router.post('/addQuestions', async (req: Request, res: Response) => {
  try {
    const questionsData = req.body;
    if (!Array.isArray(questionsData)) {
      return res.status(400).json({ msg: 'Request body must be an array of questions' });
    }
    const result = await insertQuestions(questionsData);
    return res.status(201).json({ msg: 'Questions added successfully', result });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ msg: 'Failed to add questions', error: err.message });
  }
});

router.post('/addCategories', async (req: Request, res: Response) => {
  try {
    const categoriesData = req.body;
    if (!Array.isArray(categoriesData)) {
      return res.status(400).json({ msg: 'Request body must be an array of categories' });
    }
    const result = await insertCategories(categoriesData);
    return res.status(201).json({ msg: 'Categories added successfully', result });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ msg: 'Failed to add categories', error: err.message });
  }
});

router.post('/predict', async (req: Request, res: Response) => {
  const features = req.body as Record<string, unknown>;
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

    const fallback = DEFAULT_QUIZ_CATEGORIES.find((c) => c.category === prediction.prediction);
    if (fallback) {
      return res.json({
        msg: 'success',
        prediction: prediction.prediction,
        label: prediction.label,
        category: fallback.category,
        description: fallback.description,
        suggestion: fallback.suggestion,
        source: 'default',
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Category not found',
      prediction: prediction.prediction,
      label: prediction.label,
      hint: 'Seed categories with POST /quiz/addCategories or restart server to auto-seed',
    });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ msg: 'error', error: err.message });
  }
});

export default router;
