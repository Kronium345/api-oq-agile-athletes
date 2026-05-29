import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  analyzeImage,
  foodKeywords,
  nutrientsWithAliases,
} from '../services/foodService.ts';

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

    const buffer = Buffer.from(
      imageBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );
    const uploadsDir = path.join('uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = path.join(uploadsDir, `${Date.now()}.jpg`);
    fs.writeFileSync(filename, buffer);

    const rawFoodItems = await analyzeImage(imageBase64);

    const filteredFoodItems = (rawFoodItems || []).filter((item) => {
      const name = item.name?.toLowerCase().trim() || '';
      const passesConfidence = item.confidence >= 0.25;
      const hasName = name.length >= 2 && /^[a-zA-Z\s\-]+$/.test(name);
      const keywordMatch = foodKeywords.some((keyword) => name.includes(keyword));
      return hasName && (keywordMatch || passesConfidence);
    });

    const isFood =
      filteredFoodItems.length > 0 &&
      (filteredFoodItems.length > 1 || filteredFoodItems[0].confidence >= 0.3);

    if (!isFood) {
      const randomJoke = JOKES[Math.floor(Math.random() * JOKES.length)];
      return res.status(200).json({
        isFood: false,
        joke: randomJoke,
        foodItems: [],
        path: filename,
      });
    }

    const foodItems = filteredFoodItems.map((item) => ({
      ...item,
      nutrients: item.nutrients ? nutrientsWithAliases(item.nutrients) : null,
    }));

    return res.status(200).json({
      isFood: true,
      foodItems,
      path: filename,
    });
  } catch (error: unknown) {
    console.error('Error analyzing image', error);
    return res.status(500).json({ message: 'Failed to analyze image' });
  }
});

export default router;
