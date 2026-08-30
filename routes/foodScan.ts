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
  getNutritionForFoodName,
  hasTrustedPrimaryNutrition,
  isFoodScanResult,
  mapFoodItemForResponse,
  nutrientsWithAliases,
  searchFoodNutrition,
  type FoodItemWithNutrition,
} from '../services/foodService.ts';
import { buildFoodScanApiPayload } from '../services/foodScanResponse.ts';
import {
  attachFoodImages,
  openFoodImageStream,
  resolveFoodImageRefs,
} from '../services/foodImageService.ts';
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

type ScanDocument = Awaited<ReturnType<typeof getFoodScanById>>;

function mapFoodItemsForResponse(
  items: FoodItemWithNutrition[],
  images?: Map<string, string>
) {
  return items.map((item) => ({
    ...item,
    nutrients: item.nutrients ? nutrientsWithAliases(item.nutrients) : null,
    // Always the proxy path, overriding any upstream URL stored on older scans.
    imageUrl: images?.get(item.name?.trim()),
  }));
}

function mapScanForResponse(scan: ScanDocument, images?: Map<string, string>) {
  if (!scan) return null;
  const serialized = serializeScan(scan);
  return {
    ...serialized,
    foodItems: mapFoodItemsForResponse(scan.foodItems, images),
  };
}

/**
 * Thumbnails are derived from the food name on read, so scans saved before food
 * images existed get one too. Every item across every scan is resolved in a
 * single batch to keep this to one lookup per request.
 */
async function mapScansForResponse(scans: ScanDocument[]) {
  const names = scans.flatMap((scan) => scan?.foodItems?.map((item) => item.name) ?? []);
  const images = await resolveFoodImageRefs(names);
  return scans.map((scan) => mapScanForResponse(scan, images));
}

async function mapOneScanForResponse(scan: ScanDocument) {
  const [mapped] = await mapScansForResponse([scan]);
  return mapped ?? null;
}

/** Adds thumbnails to the primary, alternates, and items of a vision analysis. */
async function attachAnalysisImages<
  T extends {
    primary: FoodItemWithNutrition | null;
    alternates: FoodItemWithNutrition[];
    foodItems: FoodItemWithNutrition[];
  },
>(analysis: T): Promise<T> {
  const items = [
    ...(analysis.primary ? [analysis.primary] : []),
    ...analysis.alternates,
    ...analysis.foodItems,
  ];
  const images = await resolveFoodImageRefs(items.map((item) => item.name));

  const withImage = <I extends FoodItemWithNutrition>(item: I): I => {
    const imageUrl = images.get(item.name?.trim());
    return imageUrl ? { ...item, imageUrl } : item;
  };

  return {
    ...analysis,
    primary: analysis.primary ? withImage(analysis.primary) : null,
    alternates: analysis.alternates.map(withImage),
    foodItems: analysis.foodItems.map(withImage),
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
    const withImages = await attachFoodImages(foodItems || []);
    const saved = await createFoodScan(userId, withImages);
    return res.status(201).json(await mapOneScanForResponse(saved));
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Error creating food scan', error: err.message });
  }
});

/**
 * Streams a food thumbnail through this API.
 *
 * Upstream hosts are not usable directly from the app: Wikimedia answers 403 to
 * the User-Agent React Native's Android image loader sends. This mirrors the
 * exercise GIF proxy so the client only ever loads images from our own origin.
 *
 * Declared before the `/:userId` routes so it is not swallowed by them.
 */
router.get('/image', async (req: Request, res: Response) => {
  const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';

  if (!key && !name) {
    return res.status(400).json({ message: 'Query parameter key or name is required' });
  }

  try {
    const image = await openFoodImageStream({ key, name });
    if (!image) {
      // No image for this food — the client falls back to its placeholder tile.
      return res.status(404).json({ message: 'No image for that food' });
    }

    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    image.stream.pipe(res);
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`[food-image] proxy failed for ${key || name}:`, err.message);
    if (!res.headersSent) {
      res.status(404).json({ message: 'Image not available' });
    }
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q : req.query.query;
    if (!query || !String(query).trim()) {
      return res.status(400).json({ message: 'Query parameter q (or query) is required' });
    }

    const limit = Math.min(Number(req.query.limit) || 8, 20);
    const results = await searchFoodNutrition(String(query).trim(), limit);
    const images = await resolveFoodImageRefs(results.map((r) => r.name));

    return res.status(200).json({
      query: String(query).trim(),
      results: results.map((r) => ({
        name: r.name,
        fdcId: r.fdcId,
        nutrients: r.nutrients,
        imageUrl: images.get(r.name.trim()),
      })),
    });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Could not search foods', error: err.message });
  }
});

/** Save a manually corrected food after a low-confidence scan. */
router.post('/confirm', async (req: Request, res: Response) => {
  const { userId, foodName } = req.body as { userId?: string; foodName?: string };

  if (!userId || !foodName?.trim()) {
    return res.status(400).json({ message: 'userId and foodName are required' });
  }

  try {
    const primary = await getNutritionForFoodName(foodName.trim());
    if (!primary.nutrients) {
      return res.status(422).json({
        success: false,
        message: 'No nutrition data found for that food name. Try a different search.',
      });
    }

    const [primaryWithImage] = await attachFoodImages([primary]);
    const saved = await createFoodScan(userId, [primaryWithImage]);
    const mapped = await mapOneScanForResponse(saved);
    return res.status(201).json({
      ...mapped,
      primary: mapFoodItemForResponse(primaryWithImage),
      foodItems: [mapFoodItemForResponse(primaryWithImage)],
      identificationQuality: 'high',
      needsManualSelection: false,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Error saving food scan', error: err.message });
  }
});

router.post('/analyze', async (req: Request, res: Response) => {
  const { userId, imagePath } = req.body as { userId?: string; imagePath?: string };

  if (!userId || !imagePath) {
    return res.status(400).json({ message: 'User ID and image path are required' });
  }

  try {
    const imageBase64 = stripDataUrlPrefix(imagePath);
    const rawAnalysis = await analyzeImage(imageBase64);

    if (!isFoodScanResult(rawAnalysis)) {
      return res.status(422).json({
        success: false,
        message:
          rawAnalysis.identificationMessage ||
          'Could not identify food in the image. Try another photo.',
      });
    }

    const analysis = await attachAnalysisImages(rawAnalysis);
    const payload = buildFoodScanApiPayload(analysis);

    if (!hasTrustedPrimaryNutrition(analysis)) {
      return res.status(200).json({
        success: true,
        saved: false,
        ...payload,
        message:
          analysis.identificationMessage ||
          'Food detected but not confident enough to auto-log. Pick an alternate or confirm with search.',
      });
    }

    const saved = await createFoodScan(userId, [analysis.primary!]);
    const mapped = await mapOneScanForResponse(saved);
    return res.status(201).json({
      success: true,
      saved: true,
      ...mapped,
      ...payload,
    });
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
      scans: await mapScansForResponse(scans),
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
      scans: await mapScansForResponse(scans),
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
      scans: await mapScansForResponse(scans),
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
    return res.json({ scans: await mapScansForResponse(scans) });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ message: 'Failed to fetch scans for date', error: err.message });
  }
});

router.get('/scans/last-three-days', async (req: Request, res: Response) => {
  try {
    const userId = resolveUserIdFilter(req);
    const days: Array<{ date: string; scans: ScanDocument[] }> = [];

    for (let i = 2; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      days.push({
        date: formatYyyyMmDd(day),
        scans: await findScansInRange(startOfDay(day), endOfDay(day), userId),
      });
    }

    // One image lookup covering all three days rather than one per day.
    const images = await resolveFoodImageRefs(
      days.flatMap((day) => day.scans.flatMap((scan) => scan?.foodItems?.map((i) => i.name) ?? []))
    );

    const data = days.map((day) => ({
      date: day.date,
      scans: day.scans.map((scan) => mapScanForResponse(scan, images)),
    }));

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
    return res.json(await mapScansForResponse(scans));
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

    return res.json(await mapOneScanForResponse(scan));
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
