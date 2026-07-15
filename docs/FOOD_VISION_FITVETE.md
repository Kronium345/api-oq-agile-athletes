# Food Scan — Gemini + FitVete

Food photos are identified with **Google Gemini** and macros come from **FitVete
`search-foods`**. The Python Clarifai/ONNX path remains available behind provider flags.

```text
Mobile → POST /analyze-food | /foodScan/analyze
              ↓
         Gemini vision → primaryConcept + alternates + isFood
              ↓
         FitVete search-foods (primary label only → total nutrition)
              ↓
         Existing Mongo + mobile payload (primary-only foodItems)
```

## Env

```bash
FOOD_VISION_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash          # lock deliberately (2.0-flash shut down)
GEMINI_TIMEOUT_MS=60000
FOOD_SCAN_PRIMARY_MIN_CONFIDENCE=0.5   # or FOOD_VISION_MIN_CONFIDENCE

NUTRITION_PROVIDER=fitvete
FITVETE_API_KEY=fv_live_...
FITVETE_BASE_URL=https://auth.fitvete.com/functions/v1/food-api
FITVETE_TIMEOUT_MS=30000
FITVETE_SEARCH_NUMBER=3
```

Rollback:
- `FOOD_VISION_PROVIDER=http` + `FOOD_VISION_URL` (Python)
- `FOOD_VISION_PROVIDER=clarifai`
- `NUTRITION_PROVIDER=usda` + `USDA_API_KEY`

## Orchestration rules

1. Compress / size-check image (unchanged).
2. Gemini returns JSON `{ isFood, primaryConcept, concepts }`.
3. If `!isFood` or no primary → `identificationQuality: none` (no fake macros).
4. If confidence &lt; primary threshold → low quality: `visionSuggestion` + alternates, empty `foodItems`.
5. If high → normalize label (`foodLabelMap`) → FitVete search → **one** primary total.
6. **Never sum alternates** into meal totals (`foodItems` = `[primary]` only).

## Routes (unchanged contracts)

- `POST /analyze-food`
- `POST /foodScan/analyze`
- Search / correct / history routes still work; text search uses FitVete when configured.

Optional additive fields on analyze payloads:

```json
{
  "vision": { "provider": "gemini", "model": "gemini-2.5-flash" },
  "nutrition": { "provider": "fitvete" }
}
```

## Cost note

Prefer Approach A (Gemini + FitVete search ~1 pt). Avoid FitVete `nutrition-from-photo` (10 pts) unless you later need a hybrid path.
