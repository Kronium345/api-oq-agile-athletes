# Node API — Food scan integration (mobile / frontend)

Use this when wiring the OQ Agile Athletes app to `api-oq-agile-athletes` food vision.

## Confidence rules

| Threshold | Env | Default | Behavior |
|-----------|-----|---------|----------|
| Primary trusted | `FOOD_SCAN_PRIMARY_MIN_CONFIDENCE` | `0.5` | `primary` + `foodItems` populated with USDA totals |
| Below primary | — | `< 0.5` | `primary: null`, `visionSuggestion: { name, confidence }`, `needsManualSelection: true` — **do not show vision label as meal total** |
| Alternates shown | `FOOD_SCAN_ALTERNATE_MIN_CONFIDENCE` | `0.15` | Only labels ≥ 0.15 in `alternates` |
| Alternate USDA | `FOOD_SCAN_ALTERNATE_NUTRITION_MIN` | `0.25` | Alternates below 0.25 have `nutrients: null` (name + confidence only) |

Example: packaged chicken misread as `lasagna` at **22%** → `identificationQuality: "low"`, `visionSuggestion: { name: "lasagna", confidence: 0.22 }`, empty `foodItems`, alternates if any ≥ 15%.

## Response shape (`POST /analyze-food`, `POST /foodScan/analyze`)

```json
{
  "isFood": true,
  "identificationQuality": "low",
  "primary": null,
  "visionSuggestion": { "name": "lasagna", "confidence": 0.22 },
  "alternates": [{ "name": "...", "confidence": 0.18, "nutrients": null }],
  "foodItems": [],
  "needsManualSelection": true,
  "allowManualSearch": true,
  "confidenceWarning": "Vision is not confident (22% match)...",
  "thresholds": { "primaryMin": 0.5, "alternateMin": 0.15 }
}
```

High confidence:

```json
{
  "identificationQuality": "high",
  "primary": { "name": "...", "confidence": 0.62, "nutrients": { "calories": 101, ... } },
  "visionSuggestion": null,
  "foodItems": [{ "...": "same as primary" }],
  "needsManualSelection": false
}
```

## UI rules

1. **Totals card** — bind only to `primary.nutrients` (or `foodItems[0]` when `identificationQuality === "high"`).
2. **Low confidence** — show `visionSuggestion` as “Possible match (not verified)” with no kcal total, or hide totals until user picks.
3. **Alternates** — tappable chips; on select call confirm/correct flow below.
4. **Never sum** `alternates` or all legacy `foodItems` into one meal total.

## Manual search / correction

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analyze-food/search?q=chicken` | USDA text search (up to 8 results) |
| POST | `/analyze-food/correct` | Body `{ "foodName": "chicken breast" }` → trusted `primary` + `foodItems` (no Mongo) |
| GET | `/foodScan/search?q=chicken` | Same search under foodScan mount |
| POST | `/foodScan/confirm` | Body `{ "userId", "foodName" }` → USDA lookup + **save** scan to Mongo |

### `POST /foodScan/analyze`

- **High confidence** → `201`, `saved: true`, scan persisted.
- **Low confidence** → `200`, `saved: false`, full payload + `needsManualSelection: true` (user must confirm or search).
- **Not food** → `422`.

## Deploy checklist

1. Set `FOOD_VISION_URL`, `FOOD_VISION_API_KEY`, `USDA_API_KEY` on Render.
2. Optional: tune `FOOD_SCAN_PRIMARY_MIN_CONFIDENCE` (default `0.5`).
3. Point app `axios` base URL to `https://api-oq-agile-athletes.onrender.com`.
4. One vision call per scan — use either `/analyze-food` or `/foodScan/analyze`, not both for the same photo.
