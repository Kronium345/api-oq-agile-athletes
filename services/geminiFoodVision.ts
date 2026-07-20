import axios, { type AxiosError } from 'axios';
import {
  assertReasonableImageBase64,
  stripDataUrlPrefix,
} from './clarifaiClient.ts';

export class GeminiFoodVisionError extends Error {
  statusCode: number;
  detail?: string;

  constructor(message: string, statusCode: number, detail?: string) {
    super(message);
    this.name = 'GeminiFoodVisionError';
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export interface GeminiFoodConcept {
  name: string;
  confidence: number;
}

export interface GeminiFoodPredictResult {
  isFood: boolean;
  primaryConcept: GeminiFoodConcept | null;
  concepts: GeminiFoodConcept[];
  model: string;
  inferenceMs: number;
}

const FOOD_JSON_SCHEMA = {
  type: 'object',
  properties: {
    isFood: { type: 'boolean' },
    primaryConcept: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['name', 'confidence'],
    },
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['name', 'confidence'],
      },
    },
  },
  required: ['isFood', 'concepts'],
} as const;

const SYSTEM_PROMPT = `You identify food in meal photos for a calorie-tracking app.
Return ONLY JSON matching the schema.
Rules:
- isFood=false if the image is not food, is blank/blurry, or you cannot identify food.
- primaryConcept = the single most likely meal/food label (short, common English name).
- concepts = primary first, then up to 4 alternates with lower confidence; confidences 0–1 and should roughly sum to ≤ 1.
- Prefer specific edible dish names (e.g. "grilled chicken breast") over brands or packaging when possible.
- Do not invent nutrition or calories.`;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new GeminiFoodVisionError(
      'GEMINI_API_KEY is not configured. Set it to enable Gemini food vision.',
      503
    );
  }
  return key;
}

export function getGeminiModel(): string {
  // Prefer Gemini 3.5 Flash — 2.5/2.0 Flash are restricted or retired for new keys.
  return process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
}

function getTimeoutMs(): number {
  return Number(process.env.GEMINI_TIMEOUT_MS || 60_000);
}

function guessMimeType(cleanBase64: string): string {
  // Magic sniffing via decode of first few bytes is optional; JPEG is the mobile default.
  if (cleanBase64.startsWith('/9j/')) return 'image/jpeg';
  if (cleanBase64.startsWith('iVBOR')) return 'image/png';
  if (cleanBase64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n > 1 && n <= 100) return Math.min(1, Math.max(0, n / 100));
  return Math.min(1, Math.max(0, n));
}

function parseConcept(raw: unknown): GeminiFoodConcept | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { name?: unknown; confidence?: unknown };
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
  return {
    name: obj.name.trim(),
    confidence: clampConfidence(obj.confidence),
  };
}

function extractJsonText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates;
  const parts = candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  return text || null;
}

function parseGeminiJson(text: string): {
  isFood: boolean;
  primaryConcept: GeminiFoodConcept | null;
  concepts: GeminiFoodConcept[];
} {
  let parsed: unknown;
  try {
    // Strip accidental markdown fences if the model ignores mime type.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new GeminiFoodVisionError('Gemini returned invalid JSON for food recognition.', 502, text.slice(0, 200));
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new GeminiFoodVisionError('Gemini food JSON was empty.', 502);
  }

  const obj = parsed as {
    isFood?: unknown;
    primaryConcept?: unknown;
    concepts?: unknown;
  };

  const isFood = Boolean(obj.isFood);
  const concepts = Array.isArray(obj.concepts)
    ? obj.concepts.map(parseConcept).filter((c): c is GeminiFoodConcept => c !== null)
    : [];

  let primaryConcept = parseConcept(obj.primaryConcept);
  if (!primaryConcept && concepts.length > 0) {
    primaryConcept = [...concepts].sort((a, b) => b.confidence - a.confidence)[0];
  }

  const conceptsWithPrimary =
    primaryConcept && !concepts.some((c) => c.name === primaryConcept!.name)
      ? [primaryConcept, ...concepts]
      : concepts.length > 0
        ? concepts
        : primaryConcept
          ? [primaryConcept]
          : [];

  return { isFood, primaryConcept: isFood ? primaryConcept : null, concepts: conceptsWithPrimary };
}

/**
 * Gemini vision → structured food labels (replaces Clarifai/Python food path).
 */
export async function predictFoodWithGemini(
  imageBase64: string
): Promise<GeminiFoodPredictResult> {
  const cleanBase64 = stripDataUrlPrefix(imageBase64);
  assertReasonableImageBase64(cleanBase64);

  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const started = Date.now();

  try {
    const response = await axios.post(
      url,
      {
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: guessMimeType(cleanBase64),
                  data: cleanBase64,
                },
              },
              {
                text: 'Identify the food in this image and return the JSON schema.',
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: FOOD_JSON_SCHEMA,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': getApiKey(),
        },
        timeout: getTimeoutMs(),
        maxBodyLength: 20 * 1024 * 1024,
        maxContentLength: 20 * 1024 * 1024,
        validateStatus: (s) => s >= 200 && s < 300,
      }
    );

    const text = extractJsonText(response.data);
    if (!text) {
      throw new GeminiFoodVisionError('Empty response from Gemini food vision.', 502);
    }

    const parsed = parseGeminiJson(text);

    return {
      isFood: parsed.isFood && Boolean(parsed.primaryConcept),
      primaryConcept: parsed.primaryConcept,
      concepts: parsed.concepts,
      model,
      inferenceMs: Date.now() - started,
    };
  } catch (error: unknown) {
    if (error instanceof GeminiFoodVisionError) throw error;

    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ error?: { message?: string } }>;
      const status = axiosErr.response?.status;
      const detail =
        axiosErr.response?.data?.error?.message ||
        (typeof axiosErr.response?.data === 'string' ? axiosErr.response.data : undefined);

      if (axiosErr.code === 'ECONNABORTED' || axiosErr.message.includes('timeout')) {
        throw new GeminiFoodVisionError(
          'Gemini food vision timed out. Try again or increase GEMINI_TIMEOUT_MS.',
          504,
          detail
        );
      }

      if (status === 400 || status === 422) {
        throw new GeminiFoodVisionError(
          detail || 'Gemini rejected the food scan image.',
          400,
          detail
        );
      }
      if (status === 401 || status === 403) {
        throw new GeminiFoodVisionError(
          'Gemini authentication failed. Check GEMINI_API_KEY.',
          status,
          detail
        );
      }
      if (status === 429) {
        throw new GeminiFoodVisionError(
          'Gemini rate limit reached. Please try again shortly.',
          429,
          detail
        );
      }
      if (status && status >= 500) {
        throw new GeminiFoodVisionError('Gemini food vision is temporarily unavailable.', 502, detail);
      }

      throw new GeminiFoodVisionError(
        detail || 'Gemini food vision request failed',
        status || 502,
        detail
      );
    }

    throw new GeminiFoodVisionError(
      `Gemini food vision failed: ${(error as Error).message}`,
      502
    );
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}
