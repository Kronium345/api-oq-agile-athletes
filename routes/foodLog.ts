import express, { Request, Response } from 'express';
import { addCaloriesToDailyIntake } from '../models/caloriePreferences.js';
import { createFoodLog, getFoodLogsByUserId, serializeLog } from '../models/foodLog.js';

const router = express.Router();

router.post('/log', async (req: Request, res: Response) => {
  const { userId, label, cal, carbohydrates, fats, proteins, sugars, imageUrl } = req.body as {
    userId?: string;
    label?: string;
    cal?: number;
    carbohydrates?: number;
    fats?: number;
    proteins?: number;
    sugars?: number;
    imageUrl?: string;
  };

  if (!userId || !label || cal === undefined) {
    return res.status(400).json({ message: 'userId, label, and cal are required' });
  }

  try {
    const foodLogEntry = await createFoodLog({
      userId,
      label,
      cal: Number(cal),
      carbohydrates: Number(carbohydrates ?? 0),
      fats: Number(fats ?? 0),
      proteins: Number(proteins ?? 0),
      sugars: Number(sugars ?? 0),
      imageUrl: imageUrl || 'N/A',
    });

    await addCaloriesToDailyIntake(userId, Number(cal));

    return res.status(201).send(serializeLog(foodLogEntry as typeof foodLogEntry & { _id?: unknown }));
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(400).json({ message: 'Failed to log food', error: err.message });
  }
});

router.get('/log/:userId', async (req: Request, res: Response) => {
  try {
    const dateParam =
      typeof req.query.date === 'string' ? req.query.date : undefined;
    const foodLog = await getFoodLogsByUserId(req.params.userId, dateParam);

    return res.send(foodLog.map((entry) => serializeLog(entry as typeof entry & { _id?: unknown })));
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Failed to fetch food logs', error: err.message });
  }
});

export default router;
