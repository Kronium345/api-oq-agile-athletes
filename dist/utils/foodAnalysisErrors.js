import { ClarifaiServiceError } from "../services/clarifaiClient.js";
import { FoodVisionError } from "../services/foodVisionClient.js";
export function isFoodAnalysisServiceError(error) {
    return error instanceof ClarifaiServiceError || error instanceof FoodVisionError;
}
/** Map vision provider errors to HTTP responses for mobile clients. */
export function foodAnalysisErrorToHttp(error) {
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
