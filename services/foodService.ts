import axios from 'axios';
import {
  assertReasonableImageBase64,
  postClarifaiJson,
  stripDataUrlPrefix,
} from './clarifaiClient.ts';
import {
  getFoodVisionProvider,
  predictFood,
  type ClarifaiLikeConcept,
  type FoodVisionProvider,
} from './foodVisionClient.ts';
import { prepareFoodScanBase64 } from '../utils/foodImagePrep.ts';
import {
  ALTERNATE_MIN_CONFIDENCE,
  ALTERNATE_NUTRITION_MIN_CONFIDENCE,
  PRIMARY_MIN_CONFIDENCE,
  type IdentificationQuality,
} from '../utils/foodScanConfidence.ts';

const USDA_API_KEY = process.env.USDA_API_KEY || '';

const FOOD_MODEL_URL =
  'https://api.clarifai.com/v2/models/food-item-recognition/versions/1d5fd481e0cf4826aa72ec3ff049e044/outputs';

const MAX_ALTERNATES = Number(process.env.FOOD_SCAN_MAX_ALTERNATES || 4);

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
  'lasagna', 'ramen', 'dumpling', 'donut', 'hamburger', 'hot dog', 'wonton',
  'pad thai', 'pho', 'risotto', 'tiramisu', 'cheesecake', 'miso', 'sashimi',
  'chicken wings', 'grilled salmon', 'fried chicken', 'roast chicken', 'beef',
  'pork', 'lamb', 'turkey', 'shrimp', 'salmon', 'tuna', 'wrap', 'bowl',
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

export interface VisionSuggestion {
  name: string;
  confidence: number;
}

/** Vision + USDA result — meal totals must use `primary` only when quality is high. */
export interface FoodScanAnalysisResult {
  identificationQuality: IdentificationQuality;
  primary: FoodItemWithNutrition | null;
  visionSuggestion: VisionSuggestion | null;
  alternates: FoodItemWithNutrition[];
  /**
   * Backward-compatible list for clients that read `foodItems`.
   * Contains only trusted `primary` (high confidence) — never sum alternates.
   */
  foodItems: FoodItemWithNutrition[];
  uncertainIdentification: boolean;
  identificationMessage?: string;
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

export function matchesFoodKeywords(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  return foodKeywords.some((keyword) => normalized.includes(keyword));
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

export interface UsdaSearchResult {
  name: string;
  fdcId?: number;
  nutrients: FoodNutrients | null;
}

/** Manual correction: USDA text search (multiple matches). */
export async function searchFoodNutrition(
  query: string,
  limit = 8
): Promise<UsdaSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (!USDA_API_KEY) {
    return [{ name: trimmed, nutrients: null }];
  }

  try {
    const usdaResponse = await axios.get<{
      foods?: Array<{
        description?: string;
        fdcId?: number;
        foodNutrients?: Array<{ nutrientName?: string; value?: number }>;
      }>;
    }>(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(trimmed)}&pageSize=${limit}`
    );

    const foods = usdaResponse.data?.foods || [];
    return foods.map((food) => ({
      name: food.description || trimmed,
      fdcId: food.fdcId,
      nutrients: extractNutrients(food),
    }));
  } catch (error: unknown) {
    const err = error as Error;
    console.log(`ERROR searching USDA for ${trimmed}`, err.message);
    return [];
  }
}

/** Manual correction: single food name → primary-shaped item with USDA. */
export async function getNutritionForFoodName(
  foodName: string,
  confidence = 1
): Promise<FoodItemWithNutrition> {
  return getNutritionInfo({ name: foodName.trim(), confidence });
}

function filterAlternateConcepts(
  concepts: Array<{ name: string; confidence: number }>,
  excludeName: string
): Array<{ name: string; confidence: number }> {
  const exclude = excludeName.toLowerCase().trim();
  return concepts
    .filter((c) => c.name.toLowerCase().trim() !== exclude)
    .filter((c) => c.confidence >= ALTERNATE_MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_ALTERNATES);
}

async function enrichAlternates(
  concepts: Array<{ name: string; confidence: number }>
): Promise<FoodItemWithNutrition[]> {
  return Promise.all(
    concepts.map(async (c) => {
      if (c.confidence >= ALTERNATE_NUTRITION_MIN_CONFIDENCE) {
        return getNutritionInfo(conceptToFoodItem(c));
      }
      return {
        name: c.name,
        confidence: c.confidence,
        nutrients: null,
      };
    })
  );
}

async function buildHttpVisionAnalysis(
  primaryConcept: { name: string; confidence: number },
  allConcepts: Array<{ name: string; confidence: number }>
): Promise<FoodScanAnalysisResult> {
  const quality: IdentificationQuality =
    primaryConcept.confidence >= PRIMARY_MIN_CONFIDENCE ? 'high' : 'low';

  const alternateConcepts = filterAlternateConcepts(allConcepts, primaryConcept.name);
  const alternates = await enrichAlternates(alternateConcepts);

  if (quality === 'high') {
    const primary = await getNutritionInfo(conceptToFoodItem(primaryConcept));
    return {
      identificationQuality: 'high',
      primary,
      visionSuggestion: null,
      alternates,
      foodItems: [primary],
      uncertainIdentification: false,
    };
  }

  return {
    identificationQuality: 'low',
    primary: null,
    visionSuggestion: {
      name: primaryConcept.name,
      confidence: primaryConcept.confidence,
    },
    alternates,
    foodItems: [],
    uncertainIdentification: false,
    identificationMessage:
      'Could not identify this food confidently. Choose an alternate below or search by name (e.g. chicken, rice bowl).',
  };
}

async function getClarifaiFoodConcepts(cleanBase64: string): Promise<ClarifaiLikeConcept[]> {
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
  return concepts.map((concept) => ({
    name: concept.name || 'unknown',
    value: concept.value ?? 0,
  }));
}

function filterFoodConcepts(
  concepts: ClarifaiLikeConcept[],
  provider: FoodVisionProvider
): ClarifaiLikeConcept[] {
  const minConfidenceWithoutKeyword = provider === 'http' ? 0.25 : 0.6;

  return concepts.filter((concept) => {
    const conceptName = (concept.name || '').toLowerCase();
    if (matchesFoodKeywords(conceptName)) {
      return true;
    }
    return (concept.value ?? 0) >= minConfidenceWithoutKeyword;
  });
}

function conceptToFoodItem(concept: { name: string; confidence: number }): {
  name: string;
  confidence: number;
} {
  return { name: concept.name, confidence: concept.confidence };
}

async function buildClarifaiAnalysis(
  primaryConcept: { name: string; confidence: number },
  alternateConcepts: Array<{ name: string; confidence: number }>
): Promise<FoodScanAnalysisResult> {
  const quality: IdentificationQuality =
    primaryConcept.confidence >= PRIMARY_MIN_CONFIDENCE ? 'high' : 'low';

  const alternates = await enrichAlternates(
    filterAlternateConcepts(alternateConcepts, primaryConcept.name)
  );

  if (quality === 'high') {
    const primary = await getNutritionInfo(conceptToFoodItem(primaryConcept));
    return {
      identificationQuality: 'high',
      primary,
      visionSuggestion: null,
      alternates,
      foodItems: [primary],
      uncertainIdentification: false,
    };
  }

  return {
    identificationQuality: 'low',
    primary: null,
    visionSuggestion: {
      name: primaryConcept.name,
      confidence: primaryConcept.confidence,
    },
    alternates,
    foodItems: [],
    uncertainIdentification: false,
    identificationMessage:
      'Could not identify this food confidently. Search for the correct food name.',
  };
}

function pickPrimaryConcept(concepts: ClarifaiLikeConcept[]): ClarifaiLikeConcept | null {
  if (concepts.length === 0) return null;
  return [...concepts].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
}

function alternateConceptsFromList(
  concepts: ClarifaiLikeConcept[],
  primary: ClarifaiLikeConcept
): Array<{ name: string; confidence: number }> {
  return concepts
    .filter((c) => c.name !== primary.name)
    .map((c) => ({ name: c.name, confidence: c.value ?? 0 }));
}

export async function analyzeImage(imageBase64: string): Promise<FoodScanAnalysisResult> {
  const stripped = stripDataUrlPrefix(imageBase64);
  const cleanBase64 = await prepareFoodScanBase64(stripped);
  assertReasonableImageBase64(cleanBase64);

  const provider = getFoodVisionProvider();

  if (provider === 'http') {
    const result = await predictFood(cleanBase64);
    const { primaryConcept, concepts } = result;

    console.log('[food-vision] predict', {
      model: result.model,
      inferenceMs: result.inferenceMs,
      primary: primaryConcept.name,
      primaryConfidence: primaryConcept.confidence,
      alternateCount: concepts.filter((c) => c.name !== primaryConcept.name).length,
    });

    const allConcepts = concepts.map((c) => ({
      name: c.name,
      confidence: c.confidence,
    }));

    return buildHttpVisionAnalysis(primaryConcept, allConcepts);
  }

  const rawConcepts = await getClarifaiFoodConcepts(cleanBase64);
  const filtered = filterFoodConcepts(rawConcepts, provider);
  const primaryConcept = pickPrimaryConcept(filtered);

  if (!primaryConcept) {
    return {
      identificationQuality: 'none',
      primary: null,
      visionSuggestion: null,
      alternates: [],
      foodItems: [],
      uncertainIdentification: true,
      identificationMessage: 'No food items detected in the image.',
    };
  }

  const primary = { name: primaryConcept.name, confidence: primaryConcept.value ?? 0 };
  const alternates = alternateConceptsFromList(filtered, primaryConcept);

  return buildClarifaiAnalysis(primary, alternates);
}

/** Whether vision detected food in the image (includes low-confidence / manual correction path). */
export function isFoodScanResult(analysis: FoodScanAnalysisResult): boolean {
  if (analysis.uncertainIdentification) return false;
  return (
    analysis.identificationQuality === 'high' ||
    analysis.identificationQuality === 'low' ||
    Boolean(analysis.visionSuggestion)
  );
}

/** Whether primary has USDA totals safe to log as the meal total. */
export function hasTrustedPrimaryNutrition(analysis: FoodScanAnalysisResult): boolean {
  return (
    analysis.identificationQuality === 'high' &&
    Boolean(analysis.primary?.nutrients)
  );
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

export function mapFoodItemForResponse(item: FoodItemWithNutrition) {
  return {
    ...item,
    nutrients: item.nutrients ? nutrientsWithAliases(item.nutrients) : null,
  };
}
