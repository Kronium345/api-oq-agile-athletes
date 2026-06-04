import type { FoodScanAnalysisResult } from './foodService.ts';
import { mapFoodItemForResponse } from './foodService.ts';
import {
  ALTERNATE_MIN_CONFIDENCE,
  PRIMARY_MIN_CONFIDENCE,
  type IdentificationQuality,
} from '../utils/foodScanConfidence.ts';

export interface FoodScanApiPayload {
  isFood: boolean;
  identificationQuality: IdentificationQuality;
  /** Trusted label + USDA totals (only when identificationQuality is high). */
  primary: ReturnType<typeof mapFoodItemForResponse> | null;
  /** Vision guess when primary is not trusted — do not use for calorie totals. */
  visionSuggestion: { name: string; confidence: number } | null;
  alternates: ReturnType<typeof mapFoodItemForResponse>[];
  foodItems: ReturnType<typeof mapFoodItemForResponse>[];
  uncertainIdentification: boolean;
  identificationMessage?: string;
  confidenceWarning?: string;
  needsManualSelection: boolean;
  allowManualSearch: boolean;
  manualSearchHint: string;
  thresholds: {
    primaryMin: number;
    alternateMin: number;
  };
}

export function buildFoodScanApiPayload(analysis: FoodScanAnalysisResult): FoodScanApiPayload {
  const primary = analysis.primary ? mapFoodItemForResponse(analysis.primary) : null;
  const alternates = analysis.alternates.map(mapFoodItemForResponse);
  const visionSuggestion = analysis.visionSuggestion
    ? {
        name: analysis.visionSuggestion.name,
        confidence: analysis.visionSuggestion.confidence,
      }
    : null;

  const isFood =
    !analysis.uncertainIdentification &&
    (analysis.identificationQuality === 'high' ||
      analysis.identificationQuality === 'low' ||
      Boolean(visionSuggestion));

  const needsManualSelection = isFood && analysis.identificationQuality === 'low';

  const payload: FoodScanApiPayload = {
    isFood,
    identificationQuality: analysis.identificationQuality,
    primary,
    visionSuggestion,
    alternates,
    foodItems: analysis.foodItems.map(mapFoodItemForResponse),
    uncertainIdentification: analysis.uncertainIdentification,
    identificationMessage: analysis.identificationMessage,
    needsManualSelection,
    allowManualSearch: true,
    manualSearchHint: 'Search by food name (e.g. chicken breast, packaged chicken) to log nutrition.',
    thresholds: {
      primaryMin: PRIMARY_MIN_CONFIDENCE,
      alternateMin: ALTERNATE_MIN_CONFIDENCE,
    },
  };

  if (analysis.identificationMessage) {
    payload.identificationMessage = analysis.identificationMessage;
  }

  if (needsManualSelection) {
    payload.confidenceWarning =
      analysis.identificationMessage ||
      `Vision is not confident (${Math.round((visionSuggestion?.confidence ?? 0) * 100)}% match). Pick an alternate or search manually — do not use the suggested label for totals.`;
  } else if (analysis.identificationQuality === 'high' && primary && primary.confidence < 0.65) {
    payload.confidenceWarning =
      'Moderate confidence — you can correct the food name using search if needed.';
  }

  return payload;
}
