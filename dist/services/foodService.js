import axios from 'axios';
import { assertReasonableImageBase64, postClarifaiJson, stripDataUrlPrefix, } from "./clarifaiClient.js";
import { getFoodVisionProvider, predictFood, toClarifaiConcepts, } from "./foodVisionClient.js";
import { prepareFoodScanBase64 } from "../utils/foodImagePrep.js";
const USDA_API_KEY = process.env.USDA_API_KEY || '';
const FOOD_MODEL_URL = 'https://api.clarifai.com/v2/models/food-item-recognition/versions/1d5fd481e0cf4826aa72ec3ff049e044/outputs';
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
    // Common Food-101 dish names (Python ONNX model)
    'lasagna', 'ramen', 'dumpling', 'donut', 'hamburger', 'hot dog', 'wonton',
    'pad thai', 'pho', 'risotto', 'tiramisu', 'cheesecake', 'miso', 'sashimi',
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
/**
 * Food-101 ONNX labels may not match foodKeywords; use a lower bar for the http provider.
 * Clarifai path keeps the original 0.6 threshold when there is no keyword match.
 */
function filterFoodConcepts(concepts, provider) {
    const minConfidenceWithoutKeyword = provider === 'http' ? 0.25 : 0.6;
    return concepts.filter((concept) => {
        const conceptName = (concept.name || '').toLowerCase();
        if (foodKeywords.some((keyword) => conceptName.includes(keyword))) {
            return true;
        }
        return (concept.value ?? 0) >= minConfidenceWithoutKeyword;
    });
}
export async function analyzeImage(imageBase64) {
    const stripped = stripDataUrlPrefix(imageBase64);
    const cleanBase64 = await prepareFoodScanBase64(stripped);
    assertReasonableImageBase64(cleanBase64);
    const provider = getFoodVisionProvider();
    let concepts;
    if (provider === 'http') {
        const result = await predictFood(cleanBase64);
        concepts = toClarifaiConcepts(result.concepts);
        console.log('[food-vision] predict', {
            model: result.model,
            inferenceMs: result.inferenceMs,
            conceptCount: concepts.length,
        });
    }
    else {
        concepts = await getClarifaiFoodConcepts(cleanBase64);
    }
    const filteredConcepts = filterFoodConcepts(concepts, provider);
    const enrichedFoods = await Promise.all(filteredConcepts.map(async (concept) => {
        const foodItem = {
            name: concept.name,
            confidence: concept.value,
        };
        return getNutritionInfo(foodItem);
    }));
    return enrichedFoods;
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
