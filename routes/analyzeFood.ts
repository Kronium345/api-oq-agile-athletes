import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { stripDataUrlPrefix } from '../services/clarifaiClient.ts';
import {
  analyzeImage,
  isFoodScanResult,
  mapFoodItemForResponse,
} from '../services/foodService.ts';
import { getFoodVisionProvider } from '../services/foodVisionClient.ts';
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

    const provider = getFoodVisionProvider();
    const analysis = await analyzeImage(imageBase64);

    if (!isFoodScanResult(analysis, provider)) {
      const randomJoke = JOKES[Math.floor(Math.random() * JOKES.length)];
      return res.status(200).json({
        isFood: false,
        joke: analysis.identificationMessage || randomJoke,
        foodItems: [],
        primary: null,
        alternates: [],
        path: filename,
      });
    }

    const primary = mapFoodItemForResponse(analysis.primary!);
    const alternates = analysis.alternates.map(mapFoodItemForResponse);

    return res.status(200).json({
      isFood: true,
      primary,
      alternates,
      /** Only the primary item — do not sum alternates for meal totals. */
      foodItems: [primary],
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
