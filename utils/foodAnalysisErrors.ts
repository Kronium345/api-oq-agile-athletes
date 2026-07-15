import { ClarifaiServiceError } from '../services/clarifaiClient.ts';
import { FitveteError } from '../services/fitveteClient.ts';
import { FoodVisionError } from '../services/foodVisionClient.ts';
import { GeminiFoodVisionError } from '../services/geminiFoodVision.ts';

export type FoodAnalysisServiceError =
  | ClarifaiServiceError
  | FoodVisionError
  | GeminiFoodVisionError
  | FitveteError;

export function isFoodAnalysisServiceError(
  error: unknown
): error is FoodAnalysisServiceError {
  return (
    error instanceof ClarifaiServiceError ||
    error instanceof FoodVisionError ||
    error instanceof GeminiFoodVisionError ||
    error instanceof FitveteError
  );
}

/** Map vision/nutrition provider errors to HTTP responses for mobile clients. */
export function foodAnalysisErrorToHttp(error: FoodAnalysisServiceError): {
  status: number;
  body: { success: false; message: string; retryAfterSeconds?: number };
} {
  const status = error.statusCode;
  const useGenericMessage = status >= 500 || status === 503 || status === 504;

  const body: { success: false; message: string; retryAfterSeconds?: number } = {
    success: false,
    message: useGenericMessage
      ? 'Could not analyze image. Please try again shortly.'
      : error.message,
  };

  if (error instanceof FitveteError && error.retryAfterSeconds) {
    body.retryAfterSeconds = error.retryAfterSeconds;
  }

  return { status, body };
}
