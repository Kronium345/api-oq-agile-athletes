import { ClarifaiServiceError } from "../services/clarifaiClient.js";
import { FitveteError } from "../services/fitveteClient.js";
import { FoodVisionError } from "../services/foodVisionClient.js";
import { GeminiFoodVisionError } from "../services/geminiFoodVision.js";
export function isFoodAnalysisServiceError(error) {
    return (error instanceof ClarifaiServiceError ||
        error instanceof FoodVisionError ||
        error instanceof GeminiFoodVisionError ||
        error instanceof FitveteError);
}
/** Map vision/nutrition provider errors to HTTP responses for mobile clients. */
export function foodAnalysisErrorToHttp(error) {
    const status = error.statusCode;
    const useGenericMessage = status >= 500 || status === 503 || status === 504;
    const body = {
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
