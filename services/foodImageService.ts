/**
 * Legacy remote thumbnail lookup: curated Wikimedia URLs, Edamam, then a Wikimedia
 * lead-image search, cached in Mongo.
 *
 * NO LONGER ON THE SEARCH PATH. Food thumbnails now come from the self-hosted
 * catalog in services/foodImageResolver.ts, which is synchronous, offline and
 * deterministic. Asking Wikipedia "what does this food look like?" per request
 * could not be made reliable — "chicken, back" finds a human back and "liver" an
 * anatomy diagram, and no amount of blocklisting fixes the underlying ambiguity.
 *
 * What is still live here:
 *   - openFoodImageStream / decodeFoodImageSrc, backing GET /foodScan/image, which
 *     serves image URLs persisted by older clients.
 *   - buildFoodImageProxyPath, for any remaining external image URL.
 *
 * The lookup tiers below are kept so previously stored external images keep
 * resolving, and because scripts/generateFoodImageMap.mjs still uses this shape to
 * populate the curated catalog offline. Nothing calls them per request.
 */
import { Readable } from 'node:stream';
import {
  CURATED_FOOD_IMAGES,
  CURATED_FOOD_KEYS_BY_SPECIFICITY,
} from './foodImageCatalog.ts';
import { readCachedFoodImages, writeCachedFoodImages } from '../models/foodImageCache.ts';
import { isEdamamEnabled, resolveEdamamImages } from './foodImageProviders/edamam.ts';
import { buildSearchCandidates, normalizeFoodName } from './foodImageNames.ts';
import { sanitizeImageUrl } from '../utils/foodImageUrl.ts';

export { buildSearchCandidates, normalizeFoodName, sanitizeImageUrl };

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const THUMB_SIZE = 320;
const MAX_TITLES_PER_QUERY = 40;

/**
 * Candidates tried per food. Every candidate for every food goes into the same
 * batched request, so a larger number costs URL length rather than round trips.
 */
const MAX_LOOKUP_CANDIDATES = 6;

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
 * Bumped whenever candidate generation changes. Cached entries record what a
 * lookup found, including misses, so without a version a smarter algorithm would
 * keep serving the old answer until the TTL expired.
 */
const LOOKUP_VERSION = 'v10';

/** Cache/memo key for a food name, scoped to the candidate algorithm version. */
function cacheKey(raw: string): string {
  const normalized = normalizeFoodName(raw);
  return normalized ? `${LOOKUP_VERSION}:${normalized}` : '';
}

/**
 * Articles that *are* about food — so the category check passes them — but whose
 * lead image is the live animal, the growing crop, or a farming scene: "Chicken as
 * food" leads with chickens in a market, "Rice" with a paddy field. The curated
 * catalog has a proper plated photo for each, so these fall back to it.
 */
const UNAPPETISING_ARTICLES = new Set([
  'Chicken',
  'Chicken as food',
  'Poultry',
  'Poultry farming',
  'Cattle',
  'Livestock',
  'Pig',
  'Domestic pig',
  'Sheep',
  'Goat',
  'Rice',
  'Hybrid rice',
  'Maize',
  'Wheat',
  'Oat',
  'Barley',
  'Soybean',
  'Fish',
  'Fishing',
  'Aquaculture',
]);

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

interface WikipediaThumbnail {
  url: string;
  /** Article the title actually resolved to, after normalization and redirects. */
  article: string;
}

/**
 * One batched pageimages call.
 *
 * `ok` distinguishes "Wikipedia said there is no such article" from "the request
 * failed", which matters because only the former is a real answer worth caching.
 */
async function fetchWikipediaThumbnails(
  titles: string[]
): Promise<{ results: Map<string, WikipediaThumbnail>; ok: boolean }> {
  const results = new Map<string, WikipediaThumbnail>();
  if (!titles.length) return { results, ok: true };

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
    if (!res.ok) return { results, ok: false };

    const json = (await res.json()) as WikipediaResponse;

    // Follow requested -> resolved, never the reverse: several titles can redirect
    // to one article, so a reverse map would drop all but one and hand an image to
    // the wrong food.
    const resolvesTo = new Map<string, string>();
    for (const entry of json.query?.normalized ?? []) resolvesTo.set(entry.from, entry.to);
    for (const entry of json.query?.redirects ?? []) resolvesTo.set(entry.from, entry.to);

    const imageOfArticle = new Map<string, string>();
    for (const page of json.query?.pages ?? []) {
      const source = page.thumbnail?.source;
      if (source && page.title) imageOfArticle.set(page.title, stripTrackingParams(source));
    }

    for (const requested of titles) {
      let article = requested;
      for (let i = 0; i < 5 && resolvesTo.has(article); i += 1) {
        article = resolvesTo.get(article)!;
      }

      const url = imageOfArticle.get(article);
      if (url) results.set(requested, { url, article });
    }
  } catch {
    return { results, ok: false };
  } finally {
    clearTimeout(timer);
  }

  return { results, ok: true };
}

/**
 * Category names that mean an article is about something edible. Wikipedia titles
 * are not food-scoped, so a term taken from a food name lands wherever it lands:
 * "chicken, back" reaches Human back and "chicken, liver" reaches the organ. Asking
 * what an article is *categorised* as rejects those without having to enumerate
 * every wrong answer in advance.
 */
const FOOD_CATEGORY_PATTERN =
  /food|cuisine|dish|cook|bak|dessert|confection|beverage|drink|soup|stew|salad|snack|bread|cake|pastr|\bpie|cheese|meat|seafood|poultry|vegetable|fruit|rice|pasta|noodle|dumpling|flour|grain|cereal|legume|bean|nut|spice|condiment|sauce|breakfast|sandwich|candy|chocolate|dairy|milk|egg|offal|giblet|sausage|cured|fermented|staple|brand|drinks/i;

interface CategoriesResponse {
  query?: {
    pages?: Array<{ title?: string; categories?: Array<{ title?: string }> }>;
  };
}

/**
 * Narrows a set of articles to those categorised as food.
 *
 * Returns undefined when the check could not be made, which callers treat as
 * "unknown" rather than "not food" — a Wikipedia hiccup should not strip images
 * that were resolving correctly a minute ago.
 */
async function selectFoodArticles(articles: string[]): Promise<Set<string> | undefined> {
  if (!articles.length) return new Set();

  const foodArticles = new Set<string>();
  let checked = false;

  for (const batch of chunk(articles, MAX_TITLES_PER_QUERY)) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'categories',
      cllimit: 'max',
      clshow: '!hidden',
      titles: batch.join('|'),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getLookupTimeoutMs());

    try {
      const res = await fetch(`${WIKIPEDIA_API}?${params}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) continue;

      const json = (await res.json()) as CategoriesResponse;
      checked = true;

      for (const page of json.query?.pages ?? []) {
        if (!page.title) continue;
        const isFood = (page.categories ?? []).some((category) =>
          FOOD_CATEGORY_PATTERN.test(category.title ?? '')
        );
        if (isFood) foodArticles.add(page.title);
      }
    } catch {
      // Timeout or malformed payload — leave this batch unverified.
    } finally {
      clearTimeout(timer);
    }
  }

  return checked ? foodArticles : undefined;
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

export interface FoodImagePlan {
  /** Candidates worth a lookup, most specific first. Empty means "curated is best". */
  lookupCandidates: string[];
  /** Curated category image, used when no specific match is found. */
  curated?: string;
  /** Curated key, which addresses the shared proxy URL. */
  curatedKey?: string;
}

/**
 * Decides how one food name should be resolved.
 *
 * A curated match found via a *generic* candidate ("pasta" inside "pasta salad")
 * is only a fallback: a lookup on the fuller name is tried first so that distinct
 * dishes get distinct pictures. Names whose most specific form is itself a curated
 * key need no lookup at all.
 */
export function planFoodImage(raw: string): FoodImagePlan {
  const candidates = buildSearchCandidates(raw);
  if (!candidates.length) return { lookupCandidates: [] };

  // The name is itself a category ("pizza"), so the curated picture is already the
  // best possible answer and no lookup can improve on it.
  const exact = normalizeFoodName(raw);
  if (CURATED_FOOD_IMAGES[exact]) {
    return { lookupCandidates: [], curated: CURATED_FOOD_IMAGES[exact], curatedKey: exact };
  }

  const curatedKey = findCuratedImageKey(raw);

  return {
    // Anything at or below the curated key resolves to the same article, so only
    // the more specific candidates can improve on it.
    lookupCandidates: candidates
      .filter((candidate) => candidate !== curatedKey)
      .slice(0, MAX_LOOKUP_CANDIDATES),
    curated: curatedKey ? CURATED_FOOD_IMAGES[curatedKey] : undefined,
    curatedKey,
  };
}

/**
 * Resolves thumbnails for many food names at once.
 * Never throws — names with no image are simply absent from the result.
 */
export async function resolveFoodImages(names: string[]): Promise<Map<string, string>> {
  const entries = await resolveFoodImageEntries(names);
  const resolved = new Map<string, string>();
  for (const [name, entry] of entries) resolved.set(name, entry.imageUrl);
  return resolved;
}

interface ResolvedFoodImage {
  imageUrl: string;
}

/**
 * Resolves thumbnails for many food names at once, preferring a dish-specific
 * picture over the food's category image. Never throws.
 */
export async function resolveFoodImageEntries(
  names: string[]
): Promise<Map<string, ResolvedFoodImage>> {
  const resolved = new Map<string, ResolvedFoodImage>();
  if (!isEnabled()) return resolved;

  const unique = Array.from(
    new Set(names.map((name) => (typeof name === 'string' ? name.trim() : '')).filter(Boolean))
  );
  if (!unique.length) return resolved;

  const plans = new Map<string, FoodImagePlan>();
  const pending: string[] = [];

  // Tier 1 — curated map and in-process memo.
  for (const name of unique) {
    const plan = planFoodImage(name);
    plans.set(name, plan);

    const useCurated = () => {
      if (plan.curated) {
        resolved.set(name, { imageUrl: plan.curated });
      }
    };

    if (!plan.lookupCandidates.length) {
      useCurated();
      continue;
    }

    const key = cacheKey(name);
    if (!key) {
      useCurated();
      continue;
    }

    const memoized = readMemo(key);
    if (memoized.hit) {
      if (memoized.value) resolved.set(name, { imageUrl: memoized.value });
      else useCurated();
      continue;
    }

    pending.push(name);
  }

  if (!pending.length || !isLookupEnabled()) {
    // Lookups disabled — everything outstanding falls back to its category image.
    for (const name of pending) {
      const plan = plans.get(name);
      if (plan?.curated) {
        resolved.set(name, { imageUrl: plan.curated });
      }
    }
    return resolved;
  }

  // Tier 2 — Mongo cache.
  const pendingKeys = pending.map((name) => cacheKey(name));
  let cached = new Map<string, string | undefined>();
  try {
    cached = await readCachedFoodImages(Array.from(new Set(pendingKeys)));
  } catch (error) {
    // Cache unavailable (e.g. Mongo not connected) — go straight to lookup.
    console.log('[food-image] cache read skipped:', (error as Error).message);
  }

  const stillPending: string[] = [];
  for (const name of pending) {
    const key = cacheKey(name);
    const plan = plans.get(name);

    if (cached.has(key)) {
      const value = cached.get(key);
      writeMemo(key, value);
      if (value) resolved.set(name, { imageUrl: value });
      else if (plan?.curated) {
        resolved.set(name, { imageUrl: plan.curated });
      }
      continue;
    }
    stillPending.push(name);
  }

  if (!stillPending.length) return resolved;

  const toCache: Array<{ key: string; imageUrl?: string; source: string }> = [];
  let wikimediaPending = stillPending;

  // Tier 3 — Edamam Food Database (food-specific thumbnails).
  if (isEdamamEnabled()) {
    const edamamEntries = stillPending.map((name) => ({
      name,
      candidates: plans.get(name)?.lookupCandidates ?? buildSearchCandidates(name),
    }));

    const { results: edamamHits, ok: edamamOk } = await resolveEdamamImages(edamamEntries);

    for (const name of stillPending) {
      const imageUrl = edamamHits.get(name);
      if (!imageUrl) continue;

      if (edamamOk) {
        const key = cacheKey(name);
        writeMemo(key, imageUrl);
        toCache.push({ key, imageUrl, source: 'edamam' });
      }

      resolved.set(name, { imageUrl });
    }

    wikimediaPending = stillPending.filter((name) => !edamamHits.has(name));
  }

  if (!wikimediaPending.length) {
    try {
      await writeCachedFoodImages(toCache);
    } catch (error) {
      console.log('[food-image] cache write skipped:', (error as Error).message);
    }
    return resolved;
  }

  // Tier 4 — batched Wikimedia lookup. Query every candidate for every
  // outstanding name in one go, then pick each name's most specific hit.
  const titles = new Set<string>();
  for (const name of wikimediaPending) {
    for (const candidate of plans.get(name)?.lookupCandidates ?? []) {
      titles.add(toWikipediaTitle(candidate));
    }
  }

  const thumbnails = new Map<string, WikipediaThumbnail>();
  let lookupComplete = true;

  for (const batch of chunk(Array.from(titles), MAX_TITLES_PER_QUERY)) {
    const { results: found, ok } = await fetchWikipediaThumbnails(batch);
    for (const [title, thumbnail] of found) thumbnails.set(title, thumbnail);
    if (!ok) lookupComplete = false;
  }

  // One extra call confirms the articles that matched are actually about food.
  const hitArticles = Array.from(new Set(Array.from(thumbnails.values(), (hit) => hit.article)));
  const foodArticles = await selectFoodArticles(hitArticles);
  if (!foodArticles) lookupComplete = false;

  const isUsable = (hit: WikipediaThumbnail): boolean => {
    if (UNAPPETISING_ARTICLES.has(hit.article)) return false;
    return foodArticles ? foodArticles.has(hit.article) : true;
  };

  const toCacheWikimedia: Array<{ key: string; imageUrl?: string; source: string }> = [];

  for (const name of wikimediaPending) {
    const plan = plans.get(name);
    let imageUrl: string | undefined;

    for (const candidate of plan?.lookupCandidates ?? []) {
      const hit = thumbnails.get(toWikipediaTitle(candidate));
      if (hit && isUsable(hit)) {
        imageUrl = hit.url;
        break;
      }
    }

    // Only a complete lookup is a real answer. Persisting a partial one would pin
    // a wrong image, or a needless fallback, for the lifetime of the cache entry.
    if (lookupComplete) {
      const key = cacheKey(name);
      // Only the lookup outcome is cached; the curated fallback is applied on read
      // so catalog edits take effect without waiting for the cache to expire.
      writeMemo(key, imageUrl);
      toCacheWikimedia.push({ key, imageUrl, source: imageUrl ? 'wikipedia' : 'none' });
    }

    if (imageUrl) resolved.set(name, { imageUrl });
    else if (plan?.curated) {
      resolved.set(name, { imageUrl: plan.curated });
    }
  }

  if (!lookupComplete) {
    console.log('[food-image] lookup incomplete, not caching this batch');
  }

  try {
    await writeCachedFoodImages([...toCache, ...toCacheWikimedia]);
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

/** Hosts the proxy will fetch from. Anything else is rejected, so `src` cannot be
 * turned into an open proxy. */
const ALLOWED_IMAGE_HOSTS = new Set([
  'upload.wikimedia.org',
  'www.edamam.com',
  'edamam-product-images.s3.amazonaws.com',
]);

function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_IMAGE_HOSTS.has(host)) return true;
  return host === 'edamam.com' || host.endsWith('.edamam.com');
}

/**
 * Proxy URLs are content-addressed by their upstream URL rather than by food name,
 * so foods that share a picture also share one cacheable URL: a search returning
 * eight "macaroni or pasta salad ..." rows costs a single image download.
 */
export function buildFoodImageProxyPath(upstreamUrl: string): string {
  const src = Buffer.from(upstreamUrl, 'utf8').toString('base64url');
  return `${FOOD_IMAGE_PROXY_PATH}?src=${src}`;
}

/** Decodes a `src` parameter, returning undefined unless it is an allowed host. */
export function decodeFoodImageSrc(src: string): string | undefined {
  let decoded: string;
  try {
    decoded = Buffer.from(src, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }

  try {
    const parsed = new URL(decoded);
    if (parsed.protocol !== 'https:') return undefined;
    if (!isAllowedImageHost(parsed.hostname)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Same as resolveFoodImages, but returns proxy paths instead of upstream URLs.
 *
 * Upstream hosts are never handed to the client: Wikimedia answers 403 to the
 * User-Agent that React Native's Android image loader sends, so images have to be
 * streamed through this API instead (see the /foodScan/image route).
 */
export async function resolveFoodImageRefs(names: string[]): Promise<Map<string, string>> {
  const entries = await resolveFoodImageEntries(names);
  const refs = new Map<string, string>();

  for (const [name, entry] of entries) {
    refs.set(name, buildFoodImageProxyPath(entry.imageUrl));
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
  src?: string;
  name?: string;
}): Promise<{
  stream: NodeJS.ReadableStream;
  contentType: string;
} | null> {
  const upstream = params.src
    ? decodeFoodImageSrc(params.src)
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
