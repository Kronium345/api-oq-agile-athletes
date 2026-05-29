import axios from 'axios';
import {
  assertReasonableImageBase64,
  postClarifaiJson,
} from './clarifaiClient.ts';

const USDA_API_KEY = process.env.USDA_API_KEY || '';

const FOOD_MODEL_URL =
  'https://api.clarifai.com/v2/models/food-item-recognition/versions/1d5fd481e0cf4826aa72ec3ff049e044/outputs';

export const foodKeywords = [
  'pizza', 'burger', 'sandwich', 'salad', 'pasta', 'sushi', 'cake', 'cookie',
  'rice', 'bread', 'meat', 'chicken', 'fish', 'soup', 'stew', 'curry',
  'noodles', 'ice cream', 'chocolate', 'cheese', 'egg', 'fries', 'taco', 'burrito',
  'steak', 'pancake', 'waffle', 'smoothie', 'juice', 'coffee', 'tea', 'drink',
  'apple', 'banana', 'orange', 'grape', 'strawberry', 'blueberry', 'mango', 'fruit',
  'potato', 'tomato', 'carrot', 'broccoli', 'spinach', 'lettuce', 'onion', 'vegetable',
  'jerra rice', 'fried rice', 'chicken fried rice', 'tandoori chicken', 'mexican chicken',
  'omelette', 'milkshake', 'dal', 'biryani', 'naan', 'roti',
  'paneer', 'samosa', 'dosa', 'idli', 'vada', 'chutney', 'gravy',
  'kebab', 'shawarma', 'falafel', 'hummus', 'pulao', 'khichdi', 'paratha',
];

export interface FoodNutrients {
  calories: number;
  fats: number;
  carbs: number;
  protein: number;
  vitamins: string[];
  minerals: string[];
}

export interface FoodItemWithNutrition {
  name: string;
  confidence: number;
  nutrients: FoodNutrients | null;
}

function defaultNutrients(): FoodNutrients {
  return {
    calories: 0,
    fats: 0,
    carbs: 0,
    protein: 0,
    vitamins: [],
    minerals: [],
  };
}

function extractNutrients(foodData: {
  foodNutrients?: Array<{ nutrientName?: string; value?: number }>;
}): FoodNutrients {
  const nutrients = defaultNutrients();

  for (const nutrient of foodData.foodNutrients || []) {
    const name = nutrient.nutrientName || '';
    switch (name) {
      case 'Energy':
        nutrients.calories = nutrient.value ?? 0;
        break;
      case 'Total lipid (fat)':
        nutrients.fats = nutrient.value ?? 0;
        break;
      case 'Carbohydrate, by difference':
        nutrients.carbs = nutrient.value ?? 0;
        break;
      case 'Protein':
        nutrients.protein = nutrient.value ?? 0;
        break;
      default:
        if (name.includes('Vitamin')) {
          nutrients.vitamins.push(name);
        } else if (
          ['Calcium', 'Iron', 'Magnesium', 'Phosphorus', 'Potassium', 'Sodium', 'Zinc'].includes(
            name
          )
        ) {
          nutrients.minerals.push(name);
        }
    }
  }

  return nutrients;
}

export async function getNutritionInfo(foodItem: {
  name: string;
  confidence: number;
}): Promise<FoodItemWithNutrition> {
  if (!USDA_API_KEY) {
    return { name: foodItem.name, confidence: foodItem.confidence, nutrients: null };
  }

  try {
    const usdaResponse = await axios.get(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(foodItem.name)}`
    );

    const foodData = usdaResponse.data?.foods?.[0];
    if (!foodData) {
      return { name: foodItem.name, confidence: foodItem.confidence, nutrients: null };
    }

    return {
      name: foodItem.name,
      confidence: foodItem.confidence,
      nutrients: extractNutrients(foodData),
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`ERROR fetching USDA data for ${foodItem.name}`, err.message);
    return { name: foodItem.name, confidence: foodItem.confidence, nutrients: null };
  }
}

export async function analyzeImage(imageBase64: string): Promise<FoodItemWithNutrition[]> {
  assertReasonableImageBase64(imageBase64);
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const response = await postClarifaiJson<{
    outputs?: Array<{ data?: { concepts?: Array<{ name?: string; value?: number }> } }>;
  }>(FOOD_MODEL_URL, {
    user_app_id: {
      user_id: 'clarifai',
      app_id: 'main',
    },
    inputs: [
      {
        data: {
          image: { base64: cleanBase64 },
        },
      },
    ],
  });

  const concepts = response?.outputs?.[0]?.data?.concepts || [];

  const filteredConcepts = concepts.filter((concept: { name?: string; value?: number }) => {
    const conceptName = (concept.name || '').toLowerCase();
    if (foodKeywords.some((keyword) => conceptName.includes(keyword))) {
      return true;
    }
    return (concept.value ?? 0) >= 0.6;
  });

  const enrichedFoods = await Promise.all(
    filteredConcepts.map(async (concept: { name?: string; value?: number }) => {
      const foodItem = {
        name: concept.name || 'unknown',
        confidence: concept.value ?? 0,
      };
      return getNutritionInfo(foodItem);
    })
  );

  return enrichedFoods;
}

/** UI-friendly aliases (scan service uses protein/carbs/fats). */
export function nutrientsWithAliases(nutrients: FoodNutrients | null) {
  if (!nutrients) return null;
  return {
    ...nutrients,
    proteins: nutrients.protein,
    carbohydrates: nutrients.carbs,
  };
}
