import express, { Request, Response } from 'express';
import {
  getCaloriePreferences,
  upsertCaloriePreferences,
  type ActivityLevel,
  type MealPreferences,
} from '../models/caloriePreferences.js';

const router = express.Router();

router.post('/preferences', async (req: Request, res: Response) => {
  const {
    userId,
    currentWeight,
    goalWeight,
    dailyCalorieIntake,
    activityLevel,
    mealPreferences,
  } = req.body as {
    userId?: string;
    currentWeight?: number;
    goalWeight?: number;
    dailyCalorieIntake?: number;
    activityLevel?: ActivityLevel;
    mealPreferences?: MealPreferences;
  };

  if (!userId || currentWeight === undefined || !activityLevel) {
    return res.status(400).json({
      message: 'userId, currentWeight, and activityLevel are required',
    });
  }

  try {
    const preferences = await upsertCaloriePreferences({
      userId,
      currentWeight: Number(currentWeight),
      goalWeight: goalWeight !== undefined ? Number(goalWeight) : undefined,
      dailyCalorieIntake: Number(dailyCalorieIntake ?? 0),
      activityLevel,
      mealPreferences,
    });
    return res.status(201).send(preferences);
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(400).json({ message: 'Failed to save preferences', error: err.message });
  }
});

router.get('/preferences/:userId', async (req: Request, res: Response) => {
  try {
    const preferences = await getCaloriePreferences(req.params.userId);
    if (!preferences) {
      return res.status(404).send();
    }
    return res.send(preferences);
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Failed to fetch preferences', error: err.message });
  }
});

export default router;
