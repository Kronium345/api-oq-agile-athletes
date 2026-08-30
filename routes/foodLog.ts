import express, { Request, Response } from 'express';
import { addCaloriesToDailyIntake } from '../models/caloriePreferences.ts';
import { createFoodLog, getFoodLogsByUserId, serializeLog } from '../models/foodLog.ts';
import { resolveFoodImageRef, resolveFoodImageRefs } from '../services/foodImageService.ts';
import { sanitizeImageUrl } from '../utils/foodImageUrl.ts';
import { routeParam } from '../utils/routeParams.ts';

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
    // Only a genuine external URL is worth storing. Thumbnails we derive ourselves
    // are recomputed from the label on read, so there is nothing to persist.
    const foodLogEntry = await createFoodLog({
      userId,
      label,
      cal: Number(cal),
      carbohydrates: Number(carbohydrates ?? 0),
      fats: Number(fats ?? 0),
      proteins: Number(proteins ?? 0),
      sugars: Number(sugars ?? 0),
      imageUrl: sanitizeImageUrl(imageUrl),
    });

    await addCaloriesToDailyIntake(userId, Number(cal));

    const serialized = serializeLog(foodLogEntry as typeof foodLogEntry & { _id?: unknown });
    return res.status(201).send({
      ...serialized,
      imageUrl: serialized.imageUrl ?? (await resolveFoodImageRef(label)),
    });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(400).json({ message: 'Failed to log food', error: err.message });
  }
});

router.get('/log/:userId', async (req: Request, res: Response) => {
  try {
    const dateParam =
      typeof req.query.date === 'string' ? req.query.date : undefined;
    const foodLog = await getFoodLogsByUserId(routeParam(req.params.userId), dateParam);
    const serialized = foodLog.map((entry) =>
      serializeLog(entry as typeof entry & { _id?: unknown })
    );

    // Thumbnails are derived from the label on read, in one batched lookup for the
    // whole list, so entries logged before food images existed get one too.
    const images = await resolveFoodImageRefs(serialized.map((entry) => entry.label));

    return res.send(
      serialized.map((entry) => ({
        ...entry,
        imageUrl: entry.imageUrl ?? images.get(entry.label?.trim()),
      }))
    );
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Failed to fetch food logs', error: err.message });
  }
});

export default router;
