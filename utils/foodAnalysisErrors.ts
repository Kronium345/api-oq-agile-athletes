import { ClarifaiServiceError } from '../services/clarifaiClient.ts';
import { FoodVisionError } from '../services/foodVisionClient.ts';

export function isFoodAnalysisServiceError(
  error: unknown
): error is ClarifaiServiceError | FoodVisionError {
  return error instanceof ClarifaiServiceError || error instanceof FoodVisionError;
}

/** Map vision provider errors to HTTP responses for mobile clients. */
export function foodAnalysisErrorToHttp(error: ClarifaiServiceError | FoodVisionError): {
  status: number;
  body: { success: false; message: string };
} {
  const status = error.statusCode;
  const useGenericMessage = status >= 500 || status === 503 || status === 504;

  return {
    status,
    body: {
      success: false,
      message: useGenericMessage ? 'Could not analyze image. Please try again shortly.' : error.message,
    },
  };
}
