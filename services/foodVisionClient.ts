import axios, { type AxiosError } from 'axios';
import {
  assertReasonableImageBase64,
  stripDataUrlPrefix,
} from './clarifaiClient.ts';

export class FoodVisionError extends Error {
  statusCode: number;
  detail?: string;

  constructor(message: string, statusCode: number, detail?: string) {
    super(message);
    this.name = 'FoodVisionError';
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export interface FoodVisionConcept {
  name: string;
  confidence: number;
}

export interface FoodVisionPredictResult {
  primaryConcept: FoodVisionConcept;
  concepts: FoodVisionConcept[];
  model: string;
  inferenceMs: number;
}

/** Shape expected by legacy filters (Clarifai-compatible). */
export interface ClarifaiLikeConcept {
  name: string;
  value: number;
}

export type FoodVisionProvider = 'gemini' | 'http' | 'clarifai';

export function getFoodVisionProvider(): FoodVisionProvider {
  const explicit = process.env.FOOD_VISION_PROVIDER?.trim().toLowerCase();
  if (explicit === 'gemini' || explicit === 'http' || explicit === 'clarifai') {
    return explicit;
  }
  // Prefer Gemini when keyed (new default path); else Python URL; else Clarifai.
  if (process.env.GEMINI_API_KEY?.trim()) return 'gemini';
  const url = process.env.FOOD_VISION_URL?.trim();
  return url ? 'http' : 'clarifai';
}

function getFoodVisionBaseUrl(): string {
  const raw = process.env.FOOD_VISION_URL?.trim();
  if (!raw) {
    throw new FoodVisionError(
      'FOOD_VISION_URL is not configured. Set it on Render or use FOOD_VISION_PROVIDER=clarifai.',
      503
    );
  }
  return raw.replace(/\/+$/, '');
}

function getFoodVisionApiKey(): string {
  const key = process.env.FOOD_VISION_API_KEY?.trim();
  if (!key) {
    throw new FoodVisionError(
      'FOOD_VISION_API_KEY is not configured. It must match the Python food-vision service.',
      503
    );
  }
  return key;
}

function getTimeoutMs(): number {
  return Number(process.env.FOOD_VISION_TIMEOUT_MS || 60_000);
}

function parseConcept(raw: { name?: string; confidence?: number } | undefined): FoodVisionConcept | null {
  if (!raw?.name || typeof raw.confidence !== 'number') return null;
  return { name: String(raw.name), confidence: Number(raw.confidence) };
}

export function toClarifaiConcepts(
  primary: FoodVisionConcept,
  concepts: FoodVisionConcept[]
): ClarifaiLikeConcept[] {
  const others = concepts.filter((c) => c.name !== primary.name);
  return [primary, ...others].map((c) => ({ name: c.name, value: c.confidence }));
}

function parseDetail(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          typeof item === 'object' && item && 'msg' in item
            ? String((item as { msg: unknown }).msg)
            : String(item)
        )
        .join('; ');
    }
  }
  return undefined;
}

function mapFoodVisionHttpError(status: number | undefined, detail?: string): FoodVisionError {
  const msg = detail || 'Food vision service request failed';

  if (status === 401 || status === 403) {
    return new FoodVisionError(
      'Food vision authentication failed. Check FOOD_VISION_API_KEY matches the Python service.',
      status,
      detail
    );
  }

  if (status === 413) {
    return new FoodVisionError(msg, 413, detail);
  }

  if (status === 422) {
    return new FoodVisionError(
      detail || 'Invalid image. Could not decode the uploaded photo.',
      422,
      detail
    );
  }

  if (status === 503) {
    return new FoodVisionError(
      'Food vision model is loading. Wait for GET /ready on the Python service, then retry in a minute.',
      503,
      detail
    );
  }

  if (status && status >= 500) {
    return new FoodVisionError('Food vision service is unavailable.', status || 502, detail);
  }

  return new FoodVisionError(msg, status || 502, detail);
}

export async function predictFood(imageBase64: string): Promise<FoodVisionPredictResult> {
  const cleanBase64 = stripDataUrlPrefix(imageBase64);
  assertReasonableImageBase64(cleanBase64);

  const baseUrl = getFoodVisionBaseUrl();
  const apiKey = getFoodVisionApiKey();

  try {
    const response = await axios.post<{
      primaryConcept?: { name?: string; confidence?: number };
      concepts?: Array<{ name?: string; confidence?: number }>;
      model?: string;
      inferenceMs?: number;
    }>(
      `${baseUrl}/v1/predict`,
      { imageBase64: cleanBase64 },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Food-Vision-Key': apiKey,
        },
        timeout: getTimeoutMs(),
        maxBodyLength: 15 * 1024 * 1024,
        maxContentLength: 15 * 1024 * 1024,
        validateStatus: (s) => s >= 200 && s < 300,
      }
    );

    const concepts = (response.data?.concepts || [])
      .map((c) => parseConcept(c))
      .filter((c): c is FoodVisionConcept => c !== null);

    let primaryConcept = parseConcept(response.data?.primaryConcept);

    if (!primaryConcept && concepts.length > 0) {
      primaryConcept = [...concepts].sort((a, b) => b.confidence - a.confidence)[0];
    }

    if (!primaryConcept) {
      throw new FoodVisionError('No food prediction from vision service.', 502);
    }

    const conceptsWithPrimary =
      concepts.length > 0 ? concepts : [primaryConcept];

    return {
      primaryConcept,
      concepts: conceptsWithPrimary,
      model: response.data?.model || 'unknown',
      inferenceMs: response.data?.inferenceMs ?? 0,
    };
  } catch (error: unknown) {
    if (error instanceof FoodVisionError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ detail?: unknown }>;
      const status = axiosErr.response?.status;
      const detail = parseDetail(axiosErr.response?.data);

      if (axiosErr.code === 'ECONNABORTED' || axiosErr.message.includes('timeout')) {
        throw new FoodVisionError(
          'Food vision request timed out. Try again or increase FOOD_VISION_TIMEOUT_MS.',
          504,
          detail
        );
      }

      throw mapFoodVisionHttpError(status, detail);
    }

    const err = error as Error;
    throw new FoodVisionError(`Food vision request failed: ${err.message}`, 502);
  }
}

/** Optional startup diagnostic — /ready does not require auth. */
export async function checkFoodVisionReady(): Promise<boolean> {
  const raw = process.env.FOOD_VISION_URL?.trim();
  if (!raw) return false;

  const baseUrl = raw.replace(/\/+$/, '');
  try {
    const response = await axios.get(`${baseUrl}/ready`, {
      timeout: 10_000,
      validateStatus: () => true,
    });
    return response.status === 200;
  } catch {
    return false;
  }
}
