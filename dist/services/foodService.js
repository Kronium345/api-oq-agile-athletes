import axios from 'axios';
import { assertReasonableImageBase64, postClarifaiJson, stripDataUrlPrefix, } from "./clarifaiClient.js";
import { getFoodVisionProvider, predictFood, } from "./foodVisionClient.js";
import { prepareFoodScanBase64 } from "../utils/foodImagePrep.js";
const USDA_API_KEY = process.env.USDA_API_KEY || '';
const FOOD_MODEL_URL = 'https://api.clarifai.com/v2/models/food-item-recognition/versions/1d5fd481e0cf4826aa72ec3ff049e044/outputs';
/** Food-101 ONNX often tops out ~0.15–0.35 on hard photos; 0.5 caused false "not food" jokes. */
const HTTP_IS_FOOD_CONFIDENCE = Number(process.env.FOOD_SCAN_IS_FOOD_CONFIDENCE || 0.15);
const UNCERTAIN_CONFIDENCE = Number(process.env.FOOD_SCAN_UNCERTAIN_CONFIDENCE || 0.12);
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
function defaultNutrients() {
    return {
        calories: 0,
        fats: 0,
        carbs: 0,
        protein: 0,
        vitamins: [],
        minerals: [],
    };
}
function extractNutrients(foodData) {
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
                }
                else if (['Calcium', 'Iron', 'Magnesium', 'Phosphorus', 'Potassium', 'Sodium', 'Zinc'].includes(name)) {
                    nutrients.minerals.push(name);
                }
        }
    }
    return nutrients;
}
export function matchesFoodKeywords(name) {
    const normalized = name.toLowerCase().trim();
    return foodKeywords.some((keyword) => normalized.includes(keyword));
}
export function isUncertainFoodIdentification(name, confidence, provider) {
    if (provider !== 'http')
        return false;
    return confidence < UNCERTAIN_CONFIDENCE && !matchesFoodKeywords(name);
}
export async function getNutritionInfo(foodItem) {
    if (!USDA_API_KEY) {
        return { name: foodItem.name, confidence: foodItem.confidence, nutrients: null };
    }
    try {
        const usdaResponse = await axios.get(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(foodItem.name)}`);
        const foodData = usdaResponse.data?.foods?.[0];
        if (!foodData) {
            return { name: foodItem.name, confidence: foodItem.confidence, nutrients: null };
        }
        return {
            name: foodItem.name,
            confidence: foodItem.confidence,
            nutrients: extractNutrients(foodData),
        };
    }
    catch (error) {
        const err = error;
        console.log(`ERROR fetching USDA data for ${foodItem.name}`, err.message);
        return { name: foodItem.name, confidence: foodItem.confidence, nutrients: null };
    }
}
async function getClarifaiFoodConcepts(cleanBase64) {
    const response = await postClarifaiJson(FOOD_MODEL_URL, {
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
function filterFoodConcepts(concepts, provider) {
    const minConfidenceWithoutKeyword = provider === 'http' ? 0.25 : 0.6;
    return concepts.filter((concept) => {
        const conceptName = (concept.name || '').toLowerCase();
        if (matchesFoodKeywords(conceptName)) {
            return true;
        }
        return (concept.value ?? 0) >= minConfidenceWithoutKeyword;
    });
}
function conceptToFoodItem(concept) {
    return { name: concept.name, confidence: concept.confidence };
}
async function buildAnalysisFromPrimaryAndAlternates(primaryConcept, alternateConcepts, provider) {
    const uncertain = isUncertainFoodIdentification(primaryConcept.name, primaryConcept.confidence, provider);
    if (uncertain) {
        return {
            primary: null,
            alternates: [],
            foodItems: [],
            uncertainIdentification: true,
            identificationMessage: 'Could not identify food confidently — try another angle or better lighting.',
        };
    }
    const primary = await getNutritionInfo(conceptToFoodItem(primaryConcept));
    const alternates = await Promise.all(alternateConcepts.slice(0, MAX_ALTERNATES).map((c) => getNutritionInfo(conceptToFoodItem(c))));
    return {
        primary,
        alternates,
        foodItems: [primary],
        uncertainIdentification: false,
    };
}
function pickPrimaryConcept(concepts) {
    if (concepts.length === 0)
        return null;
    return [...concepts].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
}
function alternateConceptsFromList(concepts, primary) {
    return concepts
        .filter((c) => c.name !== primary.name)
        .map((c) => ({ name: c.name, confidence: c.value ?? 0 }));
}
export async function analyzeImage(imageBase64) {
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
        const alternateConcepts = concepts
            .filter((c) => c.name !== primaryConcept.name)
            .map((c) => ({ name: c.name, confidence: c.confidence }));
        return buildAnalysisFromPrimaryAndAlternates(primaryConcept, alternateConcepts, provider);
    }
    const rawConcepts = await getClarifaiFoodConcepts(cleanBase64);
    const filtered = filterFoodConcepts(rawConcepts, provider);
    const primaryConcept = pickPrimaryConcept(filtered);
    if (!primaryConcept) {
        return {
            primary: null,
            alternates: [],
            foodItems: [],
            uncertainIdentification: true,
            identificationMessage: 'No food items detected in the image.',
        };
    }
    const primary = { name: primaryConcept.name, confidence: primaryConcept.value ?? 0 };
    const alternates = alternateConceptsFromList(filtered, primaryConcept);
    return buildAnalysisFromPrimaryAndAlternates(primary, alternates, provider);
}
/** Whether the scan should be treated as food (HTTP provider uses primary confidence). */
export function isFoodScanResult(analysis, provider) {
    if (analysis.uncertainIdentification || !analysis.primary) {
        return false;
    }
    if (provider === 'http') {
        return analysis.primary.confidence >= HTTP_IS_FOOD_CONFIDENCE;
    }
    const name = analysis.primary.name?.toLowerCase().trim() || '';
    const passesConfidence = analysis.primary.confidence >= 0.25;
    const hasName = name.length >= 2 && /^[a-zA-Z\s\-]+$/.test(name);
    const keywordMatch = matchesFoodKeywords(name);
    return hasName && (keywordMatch || passesConfidence) && analysis.primary.confidence >= 0.3;
}
/** UI-friendly aliases (scan service uses protein/carbs/fats). */
export function nutrientsWithAliases(nutrients) {
    if (!nutrients)
        return null;
    return {
        ...nutrients,
        proteins: nutrients.protein,
        carbohydrates: nutrients.carbs,
    };
}
export function mapFoodItemForResponse(item) {
    return {
        ...item,
        nutrients: item.nutrients ? nutrientsWithAliases(item.nutrients) : null,
    };
}
