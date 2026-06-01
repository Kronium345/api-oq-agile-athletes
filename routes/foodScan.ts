import express, { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import {
  createFoodScan,
  deleteFoodScan,
  findScansInRange,
  getFoodScanById,
  getFoodScansByUserId,
  serializeScan,
} from '../models/foodScan.ts';
import { stripDataUrlPrefix } from '../services/clarifaiClient.ts';
import {
  analyzeImage,
  foodKeywords,
  nutrientsWithAliases,
  type FoodItemWithNutrition,
} from '../services/foodService.ts';
import {
  foodAnalysisErrorToHttp,
  isFoodAnalysisServiceError,
} from '../utils/foodAnalysisErrors.ts';
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  formatYyyyMmDd,
  parseYyyyMmDd,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../utils/dateRanges.ts';
import { routeParam } from '../utils/routeParams.ts';

const router = express.Router();

function mapFoodItemsForResponse(items: FoodItemWithNutrition[]) {
  return items.map((item) => ({
    ...item,
    nutrients: item.nutrients ? nutrientsWithAliases(item.nutrients) : null,
  }));
}

function mapScanForResponse(scan: Awaited<ReturnType<typeof getFoodScanById>>) {
  if (!scan) return null;
  const serialized = serializeScan(scan);
  return {
    ...serialized,
    foodItems: mapFoodItemsForResponse(scan.foodItems),
  };
}

function resolveUserIdFilter(req: Request): string | undefined {
  const fromQuery = req.query.userId;
  if (typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();
  return undefined;
}

router.post('/', async (req: Request, res: Response) => {
  const { userId, foodItems } = req.body as { userId?: string; foodItems?: FoodItemWithNutrition[] };

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    const saved = await createFoodScan(userId, foodItems || []);
    return res.status(201).json(mapScanForResponse(saved));
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Error creating food scan', error: err.message });
  }
});

router.post('/analyze', async (req: Request, res: Response) => {
  const { userId, imagePath } = req.body as { userId?: string; imagePath?: string };

  if (!userId || !imagePath) {
    return res.status(400).json({ message: 'User ID and image path are required' });
  }

  try {
    const imageBase64 = stripDataUrlPrefix(imagePath);
    const foodItems = await analyzeImage(imageBase64);
    const validFoodItems = foodItems.filter((item) => item.nutrients !== null);

    const saved = await createFoodScan(userId, validFoodItems);
    return res.status(201).json(mapScanForResponse(saved));
  } catch (error: unknown) {
    if (isFoodAnalysisServiceError(error)) {
      console.error('Food analysis error:', error.statusCode, error.message);
      const { status, body } = foodAnalysisErrorToHttp(error);
      return res.status(status).json(body);
    }
    const err = error as { message?: string };
    console.error('Error analyzing image', err.message || err);
    return res.status(500).json({
      success: false,
      message: 'Could not analyze image. Please try again shortly.',
    });
  }
});

router.get('/scans/month/:year/:month', async (req: Request, res: Response) => {
  try {
    const year = Number(routeParam(req.params.year));
    const month = Number(routeParam(req.params.month));
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ message: 'Invalid year or month' });
    }

    const userId = resolveUserIdFilter(req);
    const start = startOfMonth(year, month);
    const end = endOfMonth(year, month);
    const scans = await findScansInRange(start, end, userId);

    return res.json({
      totalScans: scans.length,
      scans: scans.map((s) => mapScanForResponse(s)),
    });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Failed to fetch monthly scans', error: err.message });
  }
});

router.get('/scans/week', async (req: Request, res: Response) => {
  try {
    const userId = resolveUserIdFilter(req);
    const scans = await findScansInRange(startOfWeek(), endOfWeek(), userId);
    return res.json({
      totalScans: scans.length,
      scans: scans.map((s) => mapScanForResponse(s)),
    });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Failed to fetch weekly scans', error: err.message });
  }
});

router.get('/scans/today', async (req: Request, res: Response) => {
  try {
    const userId = resolveUserIdFilter(req);
    const today = new Date();
    const scans = await findScansInRange(startOfDay(today), endOfDay(today), userId);
    return res.json({
      totalScans: scans.length,
      scans: scans.map((s) => mapScanForResponse(s)),
    });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Failed to fetch today scans', error: err.message });
  }
});

router.get('/scans/date/:date', async (req: Request, res: Response) => {
  try {
    const day = parseYyyyMmDd(routeParam(req.params.date));
    if (!day) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const userId = resolveUserIdFilter(req);
    const scans = await findScansInRange(startOfDay(day), endOfDay(day), userId);
    return res.json({ scans: scans.map((s) => mapScanForResponse(s)) });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Failed to fetch scans for date', error: err.message });
  }
});

router.get('/scans/last-three-days', async (req: Request, res: Response) => {
  try {
    const userId = resolveUserIdFilter(req);
    const data: Array<{ date: string; scans: ReturnType<typeof mapScanForResponse>[] }> = [];

    for (let i = 2; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const start = startOfDay(day);
      const end = endOfDay(day);
      const scans = await findScansInRange(start, end, userId);
      data.push({
        date: formatYyyyMmDd(day),
        scans: scans.map((s) => mapScanForResponse(s)),
      });
    }

    return res.json({ data });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error fetching scans for last three days', err);
    return res.status(500).json({ message: 'Failed to fetch last three days', error: err.message });
  }
});

router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const scans = await getFoodScansByUserId(routeParam(req.params.userId));
    return res.json(scans.map((s) => mapScanForResponse(s)));
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Error fetching food scans', error: err.message });
  }
});

router.get('/:userId/:id', async (req: Request, res: Response) => {
  try {
    const userId = routeParam(req.params.userId);
    const id = routeParam(req.params.id);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid scan ID' });
    }

    const scan = await getFoodScanById(userId, id);
    if (!scan) {
      return res.status(404).json({ message: 'Food scan not found' });
    }

    return res.json(mapScanForResponse(scan));
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Error fetching food scan', error: err.message });
  }
});

router.delete('/:userId/:id', async (req: Request, res: Response) => {
  try {
    const userId = routeParam(req.params.userId);
    const id = routeParam(req.params.id);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid scan ID' });
    }

    const deleted = await deleteFoodScan(userId, id);
    if (!deleted) {
      return res.status(404).json({ message: 'Food scan not found' });
    }

    return res.json({ message: 'Food scan deleted successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Error deleting food scan', error: err.message });
  }
});

export { foodKeywords };
export default router;
