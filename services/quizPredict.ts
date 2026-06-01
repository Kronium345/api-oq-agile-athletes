import {
  getCategoryByLabel,
  getCategoryByName,
  type QuizCategory,
} from '../models/quiz.ts';
import {
  DEFAULT_QUIZ_CATEGORIES,
  getPrediction,
  type PredictionResult,
} from '../utils/mentalClassifier.ts';

export interface QuizPredictResponse {
  msg: 'success';
  prediction: string;
  label: number;
  category: string;
  description: string;
  suggestion: string;
  scores: PredictionResult['scores'];
  source?: 'mongodb' | 'default';
}

export async function resolveQuizCategory(
  prediction: PredictionResult
): Promise<{ category: QuizCategory; source: 'mongodb' | 'default' } | null> {
  const byLabel = await getCategoryByLabel(prediction.label);
  if (byLabel) {
    return { category: byLabel, source: 'mongodb' };
  }

  const byName = await getCategoryByName(prediction.prediction);
  if (byName) {
    return { category: byName, source: 'mongodb' };
  }

  const fallback = DEFAULT_QUIZ_CATEGORIES.find((c) => c.label === prediction.label);
  if (fallback) {
    return { category: { ...fallback }, source: 'default' };
  }

  return null;
}

export async function buildQuizPredictResponse(
  features: Record<string, unknown>
): Promise<QuizPredictResponse | null> {
  const prediction = getPrediction(features);
  const resolved = await resolveQuizCategory(prediction);

  if (!resolved) {
    return null;
  }

  const { category, source } = resolved;

  return {
    msg: 'success',
    prediction: category.category,
    label: prediction.label,
    category: category.category,
    description: category.description,
    suggestion: category.suggestion,
    scores: prediction.scores,
    source,
  };
}
