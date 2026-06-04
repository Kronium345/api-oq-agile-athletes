import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { stripDataUrlPrefix } from '../services/clarifaiClient.ts';
import {
  analyzeImage,
  getNutritionForFoodName,
  isFoodScanResult,
  mapFoodItemForResponse,
  searchFoodNutrition,
} from '../services/foodService.ts';
import { buildFoodScanApiPayload } from '../services/foodScanResponse.ts';
import {
  foodAnalysisErrorToHttp,
  isFoodAnalysisServiceError,
} from '../utils/foodAnalysisErrors.ts';

const router = express.Router();

const JOKES = [
  "Haha! That's not a food item! Try again.",
  'I think you captured the wrong kind of food!',
  "Not sure that's edible! Let's scan something tasty this time.",
  "That's definitely not on the menu! Let's try again.",
];

router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q : req.query.query;
    if (!query || !String(query).trim()) {
      return res.status(400).json({ message: 'Query parameter q (or query) is required' });
    }

    const limit = Math.min(Number(req.query.limit) || 8, 20);
    const results = await searchFoodNutrition(String(query).trim(), limit);

    return res.status(200).json({
      query: String(query).trim(),
      results: results.map((r) => ({
        name: r.name,
        fdcId: r.fdcId,
        nutrients: r.nutrients,
      })),
    });
  } catch (error: unknown) {
    console.error('Food search error', error);
    return res.status(500).json({ message: 'Could not search foods. Please try again.' });
  }
});

/** Manual correction after a low-confidence scan — returns a trusted primary shape. */
router.post('/correct', async (req: Request, res: Response) => {
  try {
    const { foodName } = req.body as { foodName?: string };
    if (!foodName || !foodName.trim()) {
      return res.status(400).json({ message: 'foodName is required' });
    }

    const primary = await getNutritionForFoodName(foodName.trim());
    const mapped = mapFoodItemForResponse(primary);

    return res.status(200).json({
      identificationQuality: 'high',
      primary: mapped,
      foodItems: [mapped],
      needsManualSelection: false,
      allowManualSearch: true,
    });
  } catch (error: unknown) {
    console.error('Food correct error', error);
    return res.status(500).json({ message: 'Could not look up nutrition for that food.' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body as { imageBase64?: string };

    if (!imageBase64) {
      return res.status(400).json({ message: 'Image base64 data missing' });
    }

    const buffer = Buffer.from(stripDataUrlPrefix(imageBase64), 'base64');
    const uploadsDir = path.join('uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = path.join(uploadsDir, `${Date.now()}.jpg`);
    fs.writeFileSync(filename, buffer);

    const analysis = await analyzeImage(imageBase64);

    if (!isFoodScanResult(analysis)) {
      const randomJoke = JOKES[Math.floor(Math.random() * JOKES.length)];
      return res.status(200).json({
        isFood: false,
        joke: analysis.identificationMessage || randomJoke,
        foodItems: [],
        primary: null,
        alternates: [],
        visionSuggestion: null,
        needsManualSelection: false,
        path: filename,
      });
    }

    const payload = buildFoodScanApiPayload(analysis);

    return res.status(200).json({
      ...payload,
      path: filename,
    });
  } catch (error: unknown) {
    if (isFoodAnalysisServiceError(error)) {
      console.error('Food analysis error:', error.statusCode, error.message);
      const { status, body } = foodAnalysisErrorToHttp(error);
      return res.status(status).json(body);
    }
    console.error('Error analyzing image', error);
    return res.status(500).json({
      success: false,
      message: 'Could not analyze image. Please try again shortly.',
    });
  }
});

export default router;
