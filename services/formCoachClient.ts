export class FormCoachError extends Error {
  statusCode: number;
  details?: string;

  constructor(message: string, statusCode: number, details?: string) {
    super(message);
    this.name = 'FormCoachError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface FormCoachIssue {
  issue: string;
  severity: string;
  feedback: string;
}

export interface FormCoachAnalysisResult {
  exercise: string;
  score: number;
  issues: FormCoachIssue[];
  joint_angles: Record<string, number>;
}

export interface FormCoachHealthResult {
  status: string;
  version?: string;
  exercises?: string[];
}

export interface FormCoachCatalogExercise {
  id: string;
  name?: string;
  filming_tip?: string;
  available?: boolean;
  [key: string]: unknown;
}

export interface FormCoachCatalogResult {
  exercises: FormCoachCatalogExercise[];
  coach_enabled: Array<string | FormCoachCatalogExercise>;
  specialized: Array<string | FormCoachCatalogExercise>;
  coach_launch: Array<string | FormCoachCatalogExercise>;
}

/** Legacy MVP id → catalog id */
const LEGACY_EXERCISE_ALIASES: Record<string, string> = {
  squat: 'back_squat',
};

export function normalizeExerciseId(raw: unknown, defaultId = 'back_squat'): string {
  const id = typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : defaultId;
  return LEGACY_EXERCISE_ALIASES[id] || id;
}

function catalogEntryId(entry: string | FormCoachCatalogExercise): string | null {
  if (typeof entry === 'string') return entry.trim().toLowerCase() || null;
  if (entry && typeof entry.id === 'string') return entry.id.trim().toLowerCase();
  return null;
}

function catalogEntryAvailable(entry: string | FormCoachCatalogExercise): boolean {
  if (typeof entry === 'string') return true;
  return entry.available !== false;
}

/** Build map of exercise id → enabled for analysis (from coach_enabled + exercises[].available). */
export function buildCoachEnabledMap(catalog: FormCoachCatalogResult): Map<string, boolean> {
  const enabled = new Map<string, boolean>();

  for (const entry of catalog.coach_enabled || []) {
    const id = catalogEntryId(entry);
    if (id) enabled.set(id, catalogEntryAvailable(entry));
  }

  for (const ex of catalog.exercises || []) {
    const id = ex.id?.trim().toLowerCase();
    if (!id) continue;
    if (!enabled.has(id)) {
      enabled.set(id, ex.available !== false);
    }
  }

  return enabled;
}

export function assertExerciseEnabled(
  exerciseId: string,
  catalog: FormCoachCatalogResult
): void {
  const enabled = buildCoachEnabledMap(catalog);
  if (!enabled.has(exerciseId)) {
    throw new FormCoachError(
      `Exercise "${exerciseId}" is not available for form analysis.`,
      400
    );
  }
  if (enabled.get(exerciseId) === false) {
    throw new FormCoachError(
      `Exercise "${exerciseId}" is not enabled for coaching yet.`,
      400
    );
  }
}

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const RETRYABLE_STATUSES = new Set([503, 502, 504]);

function getBaseUrl(): string {
  const raw = process.env.FORM_COACH_API_URL?.trim();
  if (!raw) {
    throw new FormCoachError(
      'Form Coach service is not configured. Set FORM_COACH_API_URL on the server.',
      503
    );
  }
  return raw.replace(/\/+$/, '');
}

function getTimeoutMs(): number {
  return Number(process.env.FORM_COACH_TIMEOUT_MS || 120_000);
}

function parseErrorDetail(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    if ('detail' in data) {
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
    if ('error' in data && typeof (data as { error: unknown }).error === 'string') {
      return (data as { error: string }).error;
    }
  }
  return undefined;
}

function mapHttpError(status: number, detail?: string): FormCoachError {
  const msg = detail || 'Form coach analysis failed';

  if (status === 400) return new FormCoachError(msg, 400, detail);
  if (status === 413) return new FormCoachError('Video exceeds the 50MB size limit.', 413, detail);
  if (status === 503) {
    return new FormCoachError(
      'Form Coach service is starting up. Please try again in a moment.',
      503,
      detail
    );
  }
  if (status >= 500) {
    return new FormCoachError(
      'Form Coach analysis is temporarily unavailable.',
      502,
      detail
    );
  }

  return new FormCoachError(msg, status, detail);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError') {
      throw new FormCoachError('Form Coach analysis timed out. Try a shorter video.', 504);
    }
    throw new FormCoachError(
      'Could not reach Form Coach service. It may be waking from sleep — try again.',
      503,
      error.message
    );
  } finally {
    clearTimeout(timer);
  }
}

async function requestWithRetry(
  url: string,
  init: RequestInit
): Promise<Response> {
  const timeoutMs = getTimeoutMs();
  let lastError: FormCoachError | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (attempt === 0 && RETRYABLE_STATUSES.has(res.status)) {
        console.warn(`[form-coach] retrying after HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return res;
    } catch (err) {
      if (err instanceof FormCoachError) {
        lastError = err;
        if (attempt === 0 && (err.statusCode === 503 || err.statusCode === 504)) {
          console.warn('[form-coach] retrying after connection/timeout error');
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw err;
      }
      throw err;
    }
  }

  throw lastError || new FormCoachError('Form Coach request failed', 502);
}

let healthCache: { data: FormCoachHealthResult; expiresAt: number } | null = null;
let exercisesCache: { data: FormCoachCatalogResult; expiresAt: number } | null = null;

export async function getFormCoachExercises(
  forceRefresh = false
): Promise<FormCoachCatalogResult> {
  const cacheMs = Number(
    process.env.FORM_COACH_EXERCISES_CACHE_MS ||
      process.env.FORM_COACH_HEALTH_CACHE_MS ||
      60_000
  );
  const now = Date.now();

  if (!forceRefresh && exercisesCache && exercisesCache.expiresAt > now) {
    return exercisesCache.data;
  }

  const res = await fetchWithTimeout(`${getBaseUrl()}/exercises`, { method: 'GET' }, 15_000);

  if (!res.ok) {
    const detail = parseErrorDetail(await res.json().catch(() => null));
    throw mapHttpError(res.status, detail);
  }

  const data = (await res.json()) as FormCoachCatalogResult;
  exercisesCache = { data, expiresAt: now + cacheMs };
  return data;
}

export async function validateExerciseForAnalysis(exerciseId: string): Promise<void> {
  const catalog = await getFormCoachExercises();
  assertExerciseEnabled(exerciseId, catalog);
}

export async function getFormCoachHealth(forceRefresh = false): Promise<FormCoachHealthResult> {
  const cacheMs = Number(process.env.FORM_COACH_HEALTH_CACHE_MS || 30_000);
  const now = Date.now();

  if (!forceRefresh && healthCache && healthCache.expiresAt > now) {
    return healthCache.data;
  }

  const res = await fetchWithTimeout(`${getBaseUrl()}/health`, { method: 'GET' }, 15_000);

  if (!res.ok) {
    const detail = parseErrorDetail(await res.json().catch(() => null));
    throw mapHttpError(res.status, detail);
  }

  const data = (await res.json()) as FormCoachHealthResult;
  healthCache = { data, expiresAt: now + cacheMs };
  return data;
}

export async function checkFormCoachReady(): Promise<boolean> {
  try {
    const health = await getFormCoachHealth();
    const statusOk = health.status === 'ok' || health.status === 'healthy';
    const hasExercises = Array.isArray(health.exercises) && health.exercises.length > 0;
    return statusOk && hasExercises;
  } catch {
    return false;
  }
}

export function assertVideoSize(byteLength: number): void {
  if (byteLength > MAX_VIDEO_BYTES) {
    throw new FormCoachError('Video exceeds the 50MB size limit.', 413);
  }
  if (byteLength === 0) {
    throw new FormCoachError('Video file is empty.', 400);
  }
}

export async function analyzeFormVideo(params: {
  videoBuffer: Buffer;
  filename: string;
  contentType?: string;
  exercise?: string;
}): Promise<FormCoachAnalysisResult> {
  assertVideoSize(params.videoBuffer.length);

  const form = new FormData();
  const blob = new Blob([new Uint8Array(params.videoBuffer)], {
    type: params.contentType || 'video/mp4',
  });
  form.append('video', blob, params.filename);
  form.append('exercise', params.exercise || 'back_squat');

  const res = await requestWithRetry(`${getBaseUrl()}/analyze-form`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const detail = parseErrorDetail(await res.json().catch(() => null));
    throw mapHttpError(res.status, detail);
  }

  return (await res.json()) as FormCoachAnalysisResult;
}

export async function fetchVideoFromUrl(videoUrl: string): Promise<{
  buffer: Buffer;
  filename: string;
  contentType: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(videoUrl);
  } catch {
    throw new FormCoachError('Invalid videoUrl.', 400);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new FormCoachError('videoUrl must use http or https.', 400);
  }

  const res = await fetchWithTimeout(videoUrl, { method: 'GET' }, 60_000);

  if (!res.ok) {
    throw new FormCoachError('Could not download video from videoUrl.', 400);
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_VIDEO_BYTES) {
    throw new FormCoachError('Video exceeds the 50MB size limit.', 413);
  }

  const arrayBuffer = await res.arrayBuffer();
  assertVideoSize(arrayBuffer.byteLength);

  const pathname = parsed.pathname;
  const filename = pathname.split('/').pop() || 'video.mp4';
  const contentType = res.headers.get('content-type') || 'video/mp4';

  return {
    buffer: Buffer.from(arrayBuffer),
    filename,
    contentType,
  };
}

export { MAX_VIDEO_BYTES };
