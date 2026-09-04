/**
 * Edamam Food Database — name → thumbnail lookup.
 *
 * Nutrition still comes from FitVete/USDA; this module only resolves images via
 * GET /api/food-database/v2/parser (requires EDAMAM_APP_ID + EDAMAM_APP_KEY).
 */
import { scoreLabelMatch } from './labelMatch.ts';

const EDAMAM_PARSER = 'https://api.edamam.com/api/food-database/v2/parser';
const MIN_MATCH_SCORE = 0.45;
const QUERY_CONCURRENCY = 4;

interface EdamamFood {
  label?: string;
  knownAs?: string;
  image?: string;
}

interface EdamamParserResponse {
  hints?: Array<{ food?: EdamamFood }>;
}

/** In-process memo so one search page does not re-query the same lookup term. */
const queryMemo = new Map<string, EdamamFood[]>();

export function isEdamamConfigured(): boolean {
  return Boolean(process.env.EDAMAM_APP_ID?.trim() && process.env.EDAMAM_APP_KEY?.trim());
}

export function isEdamamEnabled(): boolean {
  if (!isEdamamConfigured()) return false;
  return process.env.FOOD_IMAGE_EDAMAM_ENABLED?.trim().toLowerCase() !== 'false';
}

function getTimeoutMs(): number {
  return Number(process.env.FOOD_IMAGE_TIMEOUT_MS || 4_000);
}

function sanitizeEdamamImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) return undefined;

  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    if (host === 'edamam.com' || host.endsWith('.edamam.com')) return trimmed;
    if (host === 'edamam-product-images.s3.amazonaws.com') return trimmed;
  } catch {
    return undefined;
  }

  return undefined;
}

async function fetchEdamamHints(query: string): Promise<{ hints: EdamamFood[]; ok: boolean }> {
  const trimmed = query.trim();
  if (!trimmed) return { hints: [], ok: true };

  if (queryMemo.has(trimmed)) {
    return { hints: queryMemo.get(trimmed) ?? [], ok: true };
  }

  const appId = process.env.EDAMAM_APP_ID?.trim();
  const appKey = process.env.EDAMAM_APP_KEY?.trim();
  if (!appId || !appKey) return { hints: [], ok: false };

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    ingr: trimmed,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const res = await fetch(`${EDAMAM_PARSER}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.log(`[food-image] edamam ${res.status} for "${trimmed}"`);
      return { hints: [], ok: false };
    }

    const json = (await res.json()) as EdamamParserResponse;
    const hints = (json.hints ?? [])
      .map((entry) => entry.food)
      .filter((food): food is EdamamFood => Boolean(food?.label || food?.knownAs));

    queryMemo.set(trimmed, hints);
    return { hints, ok: true };
  } catch (error) {
    console.log(`[food-image] edamam lookup failed for "${trimmed}":`, (error as Error).message);
    return { hints: [], ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function pickHintForQuery(query: string, hints: EdamamFood[]): string | undefined {
  let bestUrl: string | undefined;
  let bestScore = MIN_MATCH_SCORE;

  for (const hint of hints) {
    const imageUrl = sanitizeEdamamImageUrl(hint.image);
    if (!imageUrl) continue;

    const labels = [hint.label, hint.knownAs].filter(Boolean) as string[];
    for (const label of labels) {
      const score = scoreLabelMatch(query, label);
      if (score > bestScore) {
        bestScore = score;
        bestUrl = imageUrl;
      }
    }
  }

  return bestUrl;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Resolves upstream image URLs for food names via Edamam.
 * Never throws — names with no confident match are absent from the result.
 */
export async function resolveEdamamImages(
  entries: Array<{ name: string; candidates: string[] }>
): Promise<{ results: Map<string, string>; ok: boolean }> {
  const results = new Map<string, string>();
  if (!isEdamamEnabled() || !entries.length) return { results, ok: true };

  const queries = new Set<string>();
  for (const entry of entries) {
    for (const candidate of entry.candidates) {
      const trimmed = candidate.trim();
      if (trimmed) queries.add(trimmed);
    }
  }

  const queryList = Array.from(queries);
  const fetched = await mapWithConcurrency(queryList, QUERY_CONCURRENCY, async (query) => {
    const { hints, ok } = await fetchEdamamHints(query);
    return { query, hints, ok };
  });

  const hintsByQuery = new Map<string, EdamamFood[]>();
  let ok = true;
  for (const row of fetched) {
    hintsByQuery.set(row.query, row.hints);
    if (!row.ok) ok = false;
  }

  for (const entry of entries) {
    for (const candidate of entry.candidates) {
      const hints = hintsByQuery.get(candidate.trim());
      if (!hints?.length) continue;

      const imageUrl = pickHintForQuery(candidate, hints);
      if (imageUrl) {
        results.set(entry.name, imageUrl);
        break;
      }
    }
  }

  return { results, ok };
}
