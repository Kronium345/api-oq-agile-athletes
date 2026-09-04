/**
 * Maps a food name to a self-hosted thumbnail.
 *
 * Nutrition providers (FitVete, USDA) return no imagery, so the image is derived
 * from the name against a fixed catalog of ~300 food concepts in public/food-images.
 * The match is deliberately lossy: it identifies the *visual category*, not the
 * nutrition row. "Pasta, dry, enriched" and "Pasta, cooked, no salt" are both
 * pasta, and one pasta photo represents both correctly.
 *
 * Resolution is synchronous, offline and deterministic — no network call, no cache,
 * no per-request I/O. A name with no confident match returns null, and the client's
 * FoodThumbnail renders its placeholder. That is a better answer than a wrong photo.
 */
import { LOCAL_FOOD_IMAGES, LOCAL_FOOD_KEYS_BY_SPECIFICITY } from './foodImageAssets.ts';
import {
  buildSearchCandidates,
  headOf,
  NON_DISH_MODIFIERS,
  normalizeFoodName,
  QUALIFIER_WORDS,
  stripQualifierWords,
} from './foodImageNames.ts';

/** Which tier produced a match. Internal only — the API exposes just the URL. */
export type FoodImageSource = 'exact' | 'parent' | 'category';

export interface FoodImageMatch {
  /** Catalog concept that matched, e.g. "tomato soup". */
  imageKey: string;
  /** Tier that matched, for debugging a wrong thumbnail without re-deriving it. */
  imageSource: FoodImageSource;
  /** Server-relative path; the app resolves it against SERVER_URL. */
  imageUrl: string;
}

function isEnabled(): boolean {
  return process.env.FOOD_IMAGES_ENABLED?.trim().toLowerCase() !== 'false';
}

/**
 * Crude singulariser. Providers mix number freely — USDA says "Avocados, raw" but
 * "Avocado oil", and the catalog has "scrambled eggs" but "egg".
 *
 * It only has to be *consistent*, not linguistically correct: both the concept keys
 * and the incoming candidates go through it, so mangling "hummus" to "hummu" is
 * harmless as long as it happens on both sides. The only real risk is two different
 * foods collapsing to the same form, which foodImageResolver.test.ts asserts against.
 */
function singularizeWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('ss') || word.endsWith('us')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** Number-insensitive form of a phrase, used for all catalog matching. */
export function canonicalizeConcept(value: string): string {
  return value.split(' ').filter(Boolean).map(singularizeWord).join(' ');
}

/**
 * Canonical form -> concept key. Sorted so the result is stable when two keys share
 * a canonical form ("egg" and "eggs"), and first-wins so the shorter one is kept.
 */
const CANONICAL_INDEX = new Map<string, string>();
for (const key of Object.keys(LOCAL_FOOD_IMAGES).sort()) {
  const canonical = canonicalizeConcept(key);
  if (!CANONICAL_INDEX.has(canonical)) CANONICAL_INDEX.set(canonical, key);
}

/** Looks a phrase up in the catalog, literally first and then number-insensitively. */
function lookupConcept(value: string): string | undefined {
  if (LOCAL_FOOD_IMAGES[value]) return value;
  return CANONICAL_INDEX.get(canonicalizeConcept(value));
}

/**
 * Word-boundary patterns over canonical keys, longest concept first, so "brown rice"
 * wins over "rice" and "pear" does not match inside "spear".
 */
const CATEGORY_PATTERNS = LOCAL_FOOD_KEYS_BY_SPECIFICITY.map((key) => ({
  key,
  pattern: new RegExp(`\\b${canonicalizeConcept(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
}));

/**
 * Concepts that are a single common word and would otherwise match as a substring
 * of an unrelated food. Requiring these to match a whole candidate stops "ham"
 * hitting "hamburger"-adjacent names and "cream" hitting "cream of mushroom soup".
 */
const SUBSTRING_UNSAFE_KEYS = new Set(['ham', 'cream', 'jam', 'tart', 'sauce', 'broth', 'fruit', 'vegetable']);

/**
 * Umbrella concepts that describe a whole family of foods. They are correct but
 * uninformative, so they are only used when nothing more specific matches — without
 * this, "pasta, vegetable, cooked" resolves on "vegetable" instead of "pasta",
 * because the qualifier segment is considered before the base food.
 */
const GENERIC_CONCEPTS = new Set([
  'vegetable', 'fruit', 'nuts', 'fish', 'beans', 'soup', 'stew', 'salad',
  'sauce', 'broth', 'bread', 'cheese', 'cereal', 'juice',
]);

/** Longest phrase the loose category tier will look inside. See its use below. */
const MAX_CATEGORY_MATCH_WORDS = 5;

/** Progressively broader forms of a name, used for the parent-concept tier. */
function parentForms(candidate: string): string[] {
  const forms = new Set<string>();

  const head = headOf(candidate);
  forms.add(head);
  forms.add(stripQualifierWords(head));

  // Drop leading describing words: "boneless skinless chicken" -> "chicken".
  const words = stripQualifierWords(head).split(' ').filter(Boolean);
  for (let start = 0; start < words.length; start += 1) {
    const tail = words.slice(start).join(' ');
    if (tail) forms.add(tail);
  }

  // Trailing head noun on its own: "chicken breast" -> "chicken".
  if (words.length > 1) forms.add(words[0]);

  return Array.from(forms).filter(Boolean);
}

/**
 * Resolves the thumbnail for a food name, most specific tier first:
 *
 *   1. exact    — a candidate is a catalog concept verbatim ("tomato soup")
 *   2. parent   — a broader form of a candidate is one ("chicken breast" -> "chicken")
 *   3. category — a concept appears as a whole word inside a candidate
 *
 * Returns null rather than guessing when nothing matches.
 */
export function resolveFoodImage(name: string): FoodImageMatch | null {
  if (!isEnabled() || !name?.trim()) return null;

  const candidates = buildSearchCandidates(name);
  if (!candidates.length) return null;

  // First umbrella concept seen, used only if no tier finds anything specific.
  let generic: FoodImageMatch | null = null;

  const take = (key: string, source: FoodImageSource): FoodImageMatch | null => {
    const match: FoodImageMatch = { imageKey: key, imageSource: source, imageUrl: LOCAL_FOOD_IMAGES[key] };
    if (!GENERIC_CONCEPTS.has(key)) return match;
    generic ??= match;
    return null;
  };

  for (const candidate of candidates) {
    const key = lookupConcept(candidate);
    const match = key ? take(key, 'exact') : null;
    if (match) return match;
  }

  for (const candidate of candidates) {
    for (const form of parentForms(candidate)) {
      // A bare describing word is not a food, however well it matches a concept.
      if (QUALIFIER_WORDS.has(form) || NON_DISH_MODIFIERS.has(form)) continue;
      const key = lookupConcept(form);
      const match = key ? take(key, 'parent') : null;
      if (match) return match;
    }
  }

  for (const candidate of candidates) {
    // A concept found inside a long phrase is usually one of its ingredients rather
    // than the dish — "seven-layer salad, lettuce salad made with onion, celery,
    // mayonnaise" contains three of them. Only short phrases are matched loosely.
    if (candidate.split(' ').length > MAX_CATEGORY_MATCH_WORDS) continue;

    const canonical = canonicalizeConcept(candidate);
    for (const { key, pattern } of CATEGORY_PATTERNS) {
      if (SUBSTRING_UNSAFE_KEYS.has(key) && canonical !== canonicalizeConcept(key)) continue;
      if (!pattern.test(canonical)) continue;

      const match = take(key, 'category');
      if (match) return match;
    }
  }

  if (generic) return generic;

  recordMiss(name);
  return null;
}

/** Convenience wrapper for callers that only set an `imageUrl` field. */
export function resolveFoodImageUrl(name: string): string | undefined {
  return resolveFoodImage(name)?.imageUrl;
}

/**
 * Fills in `imageUrl` for a list of items, leaving any existing value alone.
 * Synchronous, so response mapping needs no await.
 */
export function attachFoodImages<T extends { name: string; imageUrl?: string | null }>(items: T[]): T[] {
  return items.map((item) =>
    item.imageUrl ? item : { ...item, imageUrl: resolveFoodImageUrl(item.name) ?? null }
  );
}

/**
 * Misses are what drive the catalog's growth: the next concepts to add are the ones
 * users actually search for. Logged once per name per process so a repeated search
 * does not flood the log.
 */
const loggedMisses = new Set<string>();
const MAX_LOGGED_MISSES = 500;

function recordMiss(name: string): void {
  const normalized = normalizeFoodName(name);
  if (!normalized || loggedMisses.has(normalized)) return;
  if (loggedMisses.size >= MAX_LOGGED_MISSES) return;

  loggedMisses.add(normalized);
  console.log(`[food-image] no match: "${name}"`);
}

/** Number of concepts in the catalog. Used by tests and for diagnostics. */
export function getFoodImageCatalogSize(): number {
  return Object.keys(LOCAL_FOOD_IMAGES).length;
}
