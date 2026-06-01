/**
 * Mind Center — mental wellness assessment classifier.
 * Maps quiz answers (s3–s11 risk context, s12–s18 anger 0–4, s19–s25 anxiety 0–3)
 * to the 4-class anger × anxiety matrix in data/quizCategories.json.
 *
 * Replaces legacy fitness-one-server getPrediction (angerAnxiety / exercise / doctor keys).
 */

export const OUTCOME_CATEGORIES = [
  'Neither anger nor anxiety',
  'Anger Only',
  'Anxiety Only',
  'Both anger and anxiety',
] as const;

export type OutcomeCategory = (typeof OUTCOME_CATEGORIES)[number];

/** Seed data for POST /quiz/addCategories (matches frontend components/Quiz/questions.js). */
export const DEFAULT_QUIZ_CATEGORIES = [
  {
    label: 0,
    category: 'Neither anger nor anxiety',
    description:
      "According to our model's evaluation, it indicates that you are not exhibiting symptoms of either anger or anxiety.",
    suggestion: 'exercise',
  },
  {
    label: 1,
    category: 'Anger Only',
    description:
      "According to our model's analysis, it predicts that you are currently experiencing symptoms related to anger.",
    suggestion: 'all',
  },
  {
    label: 2,
    category: 'Anxiety Only',
    description:
      'Based on the data processed by our model, it indicates that you are likely facing symptoms associated with anxiety.',
    suggestion: 'all',
  },
  {
    label: 3,
    category: 'Both anger and anxiety',
    description:
      'According to the information provided, our model suggests that you are experiencing symptoms related to both anger and anxiety.',
    suggestion: 'all',
  },
] as const;

const RISK_KEYS = ['s3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'];
const ANGER_KEYS = ['s12', 's13', 's14', 's15', 's16', 's17', 's18'];
const ANXIETY_KEYS = ['s19', 's20', 's21', 's22', 's23', 's24', 's25'];

/** Sum thresholds (~50% of max scales); lowered when risk-factor average is elevated. */
const ANGER_SUM_THRESHOLD = 14; // 7 items × 0–4 → max 28
const ANXIETY_SUM_THRESHOLD = 10; // 7 items × 0–3 → max 21 (GAD-7–style band)
const RISK_AVG_SENSITIVITY = 2; // avg ≥ this reduces thresholds by 2

function parseFeatureValue(features: Record<string, unknown>, key: string): number | null {
  const raw = features[key];
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function scoreKeys(
  features: Record<string, unknown>,
  keys: string[],
  maxPerItem: number
): { sum: number; count: number; avg: number } {
  let sum = 0;
  let count = 0;
  for (const key of keys) {
    const value = parseFeatureValue(features, key);
    if (value === null) continue;
    const clamped = Math.min(maxPerItem, Math.max(0, value));
    sum += clamped;
    count += 1;
  }
  return { sum, count, avg: count > 0 ? sum / count : 0 };
}

export interface PredictionResult {
  msg: 'success';
  prediction: OutcomeCategory;
  label: number;
  scores: {
    angerSum: number;
    anxietySum: number;
    riskAvg: number;
    angerThreshold: number;
    anxietyThreshold: number;
  };
}

/**
 * Classify assessment from answer map { s3: 0, s12: 3, ... }.
 */
export function getPrediction(features: Record<string, unknown>): PredictionResult {
  const anger = scoreKeys(features, ANGER_KEYS, 4);
  const anxiety = scoreKeys(features, ANXIETY_KEYS, 3);
  const risk = scoreKeys(features, RISK_KEYS, 4);

  let angerThreshold = ANGER_SUM_THRESHOLD;
  let anxietyThreshold = ANXIETY_SUM_THRESHOLD;
  if (risk.count > 0 && risk.avg >= RISK_AVG_SENSITIVITY) {
    angerThreshold -= 2;
    anxietyThreshold -= 2;
  }

  const hasAnger = anger.count > 0 && anger.sum >= angerThreshold;
  const hasAnxiety = anxiety.count > 0 && anxiety.sum >= anxietyThreshold;

  let label: number;
  if (!hasAnger && !hasAnxiety) label = 0;
  else if (hasAnger && !hasAnxiety) label = 1;
  else if (!hasAnger && hasAnxiety) label = 2;
  else label = 3;

  return {
    msg: 'success',
    prediction: OUTCOME_CATEGORIES[label],
    label,
    scores: {
      angerSum: anger.sum,
      anxietySum: anxiety.sum,
      riskAvg: risk.avg,
      angerThreshold,
      anxietyThreshold,
    },
  };
}
