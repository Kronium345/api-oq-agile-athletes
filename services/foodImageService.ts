/**
 * Resolves a thumbnail for a food name.
 *
 * Nutrition providers (FitVete, USDA) return no imagery at all, so images are
 * derived from the food name in two tiers:
 *
 *   1. Curated category map — instant, offline, covers the common searches.
 *   2. Wikimedia lead-image lookup — batched and cached, covers the long tail.
 *
 * Resolution is strictly best-effort: every failure path degrades to "no image"
 * so that a slow or broken image source can never fail a food search.
 */
import { Readable } from 'node:stream';
import {
  CURATED_FOOD_IMAGES,
  CURATED_FOOD_KEYS_BY_SPECIFICITY,
} from './foodImageCatalog.ts';
import { readCachedFoodImages, writeCachedFoodImages } from '../models/foodImageCache.ts';
import { sanitizeImageUrl } from '../utils/foodImageUrl.ts';

export { sanitizeImageUrl };

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const THUMB_SIZE = 320;
const MAX_TITLES_PER_QUERY = 40;

/** Wikimedia asks API clients to identify themselves. */
const USER_AGENT =
  process.env.FOOD_IMAGE_USER_AGENT?.trim() ||
  'oq-agile-athletes/1.0 (food thumbnail lookup)';

function isEnabled(): boolean {
  return process.env.FOOD_IMAGES_ENABLED?.trim().toLowerCase() !== 'false';
}

/** Lets the curated tier keep working if Wikimedia needs to be switched off. */
function isLookupEnabled(): boolean {
  return process.env.FOOD_IMAGE_LOOKUP_ENABLED?.trim().toLowerCase() !== 'false';
}

function getLookupTimeoutMs(): number {
  return Number(process.env.FOOD_IMAGE_TIMEOUT_MS || 4_000);
}

/**
 * USDA-style qualifiers that describe preparation rather than the food itself.
 * Dropping them turns "pasta, dry, enriched" into "pasta".
 */
const QUALIFIER_WORDS = new Set([
  'nfs', 'ns', 'nfd', 'nsk', 'unspecified', 'unprepared', 'prepared',
  'cooked', 'uncooked', 'raw', 'dry', 'dried', 'fresh', 'frozen', 'canned',
  'boiled', 'baked', 'roasted', 'steamed', 'microwaved', 'reheated',
  'enriched', 'unenriched', 'fortified', 'unfortified',
  'without', 'added', 'salt', 'sugar', 'fat', 'oil',
  'drained', 'undrained', 'rinsed', 'peeled', 'unpeeled', 'sliced', 'chopped',
  'whole', 'half', 'part', 'skim', 'lowfat', 'nonfat', 'fatfree', 'reduced',
  'regular', 'plain', 'unsweetened', 'sweetened', 'seasoned', 'unseasoned',
  'homemade', 'restaurant', 'fastfood', 'commercial', 'store', 'brand',
  'includes', 'varieties', 'types', 'form', 'method', 'ready', 'eat', 'serve',
]);

function stripQualifierWords(segment: string): string {
  const kept = segment
    .split(' ')
    .filter((word) => word && !QUALIFIER_WORDS.has(word));
  return kept.join(' ').trim();
}

/** Cache key: lowercase, punctuation-free, whitespace-collapsed. */
export function normalizeFoodName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turns one food name into search terms ordered most-specific first.
 * "pasta with sauce, nfs" -> ["pasta with sauce", "pasta"]
 */
export function buildSearchCandidates(raw: string): string[] {
  const normalized = normalizeFoodName(raw);
  if (!normalized) return [];

  const segments = normalized
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) return [];

  const candidates: string[] = [];
  const add = (value: string) => {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (cleaned && cleaned.length > 1 && !candidates.includes(cleaned)) {
      candidates.push(cleaned);
    }
  };

  // Progressively drop trailing comma segments: most detail first, base food last.
  for (let count = segments.length; count >= 1; count -= 1) {
    add(segments.slice(0, count).join(' '));
  }

  const base = segments[0];
  add(base);
  add(stripQualifierWords(base));

  // "pasta with sauce" / "chicken and rice" -> "pasta" / "chicken"
  const head = base.split(/\s+(?:with|without|and|in|on|from)\s+/)[0];
  add(head);
  add(stripQualifierWords(head));

  return candidates;
}

const CURATED_KEY_PATTERNS = CURATED_FOOD_KEYS_BY_SPECIFICITY.map((key) => ({
  key,
  // Word-boundary match so "pear" does not match inside "spear".
  pattern: new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
}));

/** Curated tier: exact key, then longest-first word-boundary match. */
export function findCuratedImageKey(raw: string): string | undefined {
  const candidates = buildSearchCandidates(raw);

  for (const candidate of candidates) {
    if (CURATED_FOOD_IMAGES[candidate]) return candidate;
  }

  for (const candidate of candidates) {
    for (const { key, pattern } of CURATED_KEY_PATTERNS) {
      if (pattern.test(candidate)) return key;
    }
  }

  return undefined;
}

export function findCuratedImage(raw: string): string | undefined {
  const key = findCuratedImageKey(raw);
  return key ? CURATED_FOOD_IMAGES[key] : undefined;
}

function toWikipediaTitle(term: string): string {
  return term
    .split(' ')
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

interface WikipediaResponse {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Array<{ title?: string; thumbnail?: { source?: string } }>;
  };
}

/** One batched pageimages call. Returns requested-title -> thumbnail URL. */
async function fetchWikipediaThumbnails(titles: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (!titles.length) return results;

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: String(THUMB_SIZE),
    redirects: '1',
    origin: '*',
    titles: titles.join('|'),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getLookupTimeoutMs());

  try {
    const res = await fetch(`${WIKIPEDIA_API}?${params}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return results;

    const json = (await res.json()) as WikipediaResponse;

    // Map the page Wikipedia actually returned back to the title we asked for.
    const aliases = new Map<string, string>();
    for (const entry of json.query?.normalized ?? []) aliases.set(entry.to, entry.from);
    for (const entry of json.query?.redirects ?? []) aliases.set(entry.to, entry.from);

    for (const page of json.query?.pages ?? []) {
      const source = page.thumbnail?.source;
      if (!source || !page.title) continue;

      let title = page.title;
      for (let i = 0; i < 5 && aliases.has(title); i += 1) {
        title = aliases.get(title)!;
      }
      results.set(title, stripTrackingParams(source));
    }
  } catch {
    // Timeout, DNS, or malformed payload — fall through to no results.
  } finally {
    clearTimeout(timer);
  }

  return results;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Process-local memo so repeated searches skip Mongo entirely. */
const memo = new Map<string, string | undefined>();
const MEMO_MAX_ENTRIES = 2_000;

function readMemo(key: string): { hit: boolean; value?: string } {
  if (!memo.has(key)) return { hit: false };
  return { hit: true, value: memo.get(key) };
}

function writeMemo(key: string, value: string | undefined): void {
  if (memo.size >= MEMO_MAX_ENTRIES) {
    // Cheap eviction: drop the oldest insertion.
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(key, value);
}

/**
 * Resolves thumbnails for many food names at once.
 * Never throws — names with no image are simply absent from the result.
 */
export async function resolveFoodImages(names: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  if (!isEnabled()) return resolved;

  const unique = Array.from(
    new Set(names.map((name) => (typeof name === 'string' ? name.trim() : '')).filter(Boolean))
  );
  if (!unique.length) return resolved;

  const pending: string[] = [];

  // Tier 1 — curated map and in-process memo.
  for (const name of unique) {
    const curated = findCuratedImage(name);
    if (curated) {
      resolved.set(name, curated);
      continue;
    }

    const key = normalizeFoodName(name);
    if (!key) continue;

    const memoized = readMemo(key);
    if (memoized.hit) {
      if (memoized.value) resolved.set(name, memoized.value);
      continue;
    }

    pending.push(name);
  }

  if (!pending.length || !isLookupEnabled()) return resolved;

  // Tier 2 — Mongo cache.
  const pendingKeys = pending.map((name) => normalizeFoodName(name));
  let cached = new Map<string, string | undefined>();
  try {
    cached = await readCachedFoodImages(Array.from(new Set(pendingKeys)));
  } catch (error) {
    // Cache unavailable (e.g. Mongo not connected) — go straight to lookup.
    console.log('[food-image] cache read skipped:', (error as Error).message);
  }

  const stillPending: string[] = [];
  for (const name of pending) {
    const key = normalizeFoodName(name);
    if (cached.has(key)) {
      const value = cached.get(key);
      writeMemo(key, value);
      if (value) resolved.set(name, value);
      continue;
    }
    stillPending.push(name);
  }

  if (!stillPending.length) return resolved;

  // Tier 3 — batched Wikimedia lookup. Query every candidate for every
  // outstanding name in one go, then pick each name's most specific hit.
  const candidatesByName = new Map<string, string[]>();
  const titles = new Set<string>();

  for (const name of stillPending) {
    const candidates = buildSearchCandidates(name).slice(0, 3);
    candidatesByName.set(name, candidates);
    for (const candidate of candidates) titles.add(toWikipediaTitle(candidate));
  }

  const thumbnails = new Map<string, string>();
  for (const batch of chunk(Array.from(titles), MAX_TITLES_PER_QUERY)) {
    const found = await fetchWikipediaThumbnails(batch);
    for (const [title, url] of found) thumbnails.set(title, url);
  }

  const toCache: Array<{ key: string; imageUrl?: string; source: string }> = [];

  for (const name of stillPending) {
    const candidates = candidatesByName.get(name) ?? [];
    let imageUrl: string | undefined;

    for (const candidate of candidates) {
      const hit = thumbnails.get(toWikipediaTitle(candidate));
      if (hit) {
        imageUrl = hit;
        break;
      }
    }

    const key = normalizeFoodName(name);
    writeMemo(key, imageUrl);
    if (imageUrl) resolved.set(name, imageUrl);

    // Cache misses too, so an obscure name is not looked up on every search.
    toCache.push({ key, imageUrl, source: imageUrl ? 'wikipedia' : 'none' });
  }

  try {
    await writeCachedFoodImages(toCache);
  } catch (error) {
    console.log('[food-image] cache write skipped:', (error as Error).message);
  }

  return resolved;
}

/** Single-name convenience wrapper. Returns the upstream URL. */
export async function resolveFoodImage(name: string): Promise<string | undefined> {
  if (!name?.trim()) return undefined;
  const resolved = await resolveFoodImages([name]);
  return resolved.get(name.trim());
}

/**
 * Path of the image proxy route, relative to the API root. The app prepends its
 * SERVER_URL, mirroring how exercise GIF URLs are handled.
 */
export const FOOD_IMAGE_PROXY_PATH = '/foodScan/image';

/**
 * Curated hits are addressed by category so that every food mapping to the same
 * picture shares one URL — all the "pizza, ..." variants in a search then cost a
 * single image download instead of one each. Long-tail hits fall back to the name.
 */
export function buildFoodImageProxyPath(name: string): string {
  const curatedKey = findCuratedImageKey(name);
  return curatedKey
    ? `${FOOD_IMAGE_PROXY_PATH}?key=${encodeURIComponent(curatedKey)}`
    : `${FOOD_IMAGE_PROXY_PATH}?name=${encodeURIComponent(name.trim())}`;
}

/**
 * Same as resolveFoodImages, but returns proxy paths instead of upstream URLs.
 *
 * Upstream hosts are never handed to the client: Wikimedia answers 403 to the
 * User-Agent that React Native's Android image loader sends, so images have to be
 * streamed through this API instead (see the /foodScan/image route).
 */
export async function resolveFoodImageRefs(names: string[]): Promise<Map<string, string>> {
  const refs = new Map<string, string>();

  // Curated names need no lookup at all, so only the rest reach resolveFoodImages.
  const unresolved: string[] = [];
  for (const name of names) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || refs.has(trimmed)) continue;

    if (findCuratedImageKey(trimmed)) {
      refs.set(trimmed, buildFoodImageProxyPath(trimmed));
    } else {
      unresolved.push(trimmed);
    }
  }

  if (unresolved.length) {
    const upstream = await resolveFoodImages(unresolved);
    for (const name of upstream.keys()) {
      refs.set(name, buildFoodImageProxyPath(name));
    }
  }

  return refs;
}

export async function resolveFoodImageRef(name: string): Promise<string | undefined> {
  const refs = await resolveFoodImageRefs([name]);
  return refs.get(name?.trim());
}

/**
 * Attaches a proxied `imageUrl` to items that have a resolvable image, leaving
 * the original objects untouched.
 */
export async function attachFoodImages<T extends { name: string; imageUrl?: string }>(
  items: T[]
): Promise<T[]> {
  if (!items.length) return items;

  const refs = await resolveFoodImageRefs(items.map((item) => item.name));
  if (!refs.size) return items;

  return items.map((item) => {
    const imageUrl = refs.get(item.name?.trim());
    return imageUrl ? { ...item, imageUrl } : item;
  });
}

/**
 * Fetches the upstream thumbnail for a food name as a stream, for the image proxy
 * route. Sends a descriptive User-Agent because Wikimedia rejects generic ones.
 */
export async function openFoodImageStream(params: {
  name?: string;
  key?: string;
}): Promise<{
  stream: NodeJS.ReadableStream;
  contentType: string;
} | null> {
  const upstream = params.key
    ? CURATED_FOOD_IMAGES[params.key]
    : params.name
      ? await resolveFoodImage(params.name)
      : undefined;
  if (!upstream) return null;

  const res = await fetch(upstream, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
  });
  if (!res.ok || !res.body) return null;

  return {
    stream: Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    contentType: res.headers.get('content-type') || 'image/jpeg',
  };
}
