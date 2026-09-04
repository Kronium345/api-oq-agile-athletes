/**
 * Turns a nutrition-provider food name into terms we can match against the image
 * catalog.
 *
 * FitVete and USDA name foods category-first and qualifier-heavy — "soup, tomato,
 * canned, condensed", "pasta, dry, enriched" — which is not how dishes are named in
 * English. Everything here exists to recover the dish ("tomato soup") and the parent
 * concept ("pasta") from that shape.
 *
 * Pure string work, no I/O, so it is safe to call on every search result.
 */

/**
 * USDA-style qualifiers that describe preparation rather than the food itself.
 * Dropping them turns "pasta, dry, enriched" into "pasta".
 */
export const QUALIFIER_WORDS = new Set([
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

/**
 * Words that describe a food rather than name one, so they must never be matched
 * alone: "rice, white" would otherwise resolve on the word "white".
 */
export const NON_DISH_MODIFIERS = new Set([
  'white', 'brown', 'green', 'yellow', 'black', 'blue', 'dark', 'light', 'pale', 'golden',
  'large', 'small', 'medium', 'mini', 'jumbo', 'thick', 'thin', 'long', 'short',
  'grain', 'long grain', 'short grain', 'whole grain', 'ground',
  'mixed', 'assorted', 'other', 'misc', 'miscellaneous', 'generic', 'instant',
  'all', 'class', 'classes', 'various', 'total', 'composite',
  // Cooking methods and coatings. These stay usable in combinations, where they
  // name real dishes ("fried chicken"), but alone they drift to the technique.
  'fried', 'breaded', 'battered', 'crumbed', 'grilled', 'smoked', 'stewed', 'stewing',
  'roasting', 'broiled', 'poached', 'braised', 'sauteed', 'glazed', 'marinated',
  'pickled', 'candied', 'creamed', 'mashed', 'shredded', 'minced', 'meatless',
  // Body-part words that are not foods on their own ("chicken, back").
  'back',
  'sweet', 'sour', 'salty', 'spicy', 'mild', 'soft', 'hard', 'crisp', 'creamy',
  'reduced', 'free', 'extra', 'double', 'single', 'style', 'type', 'variety', 'flavored',
]);

/** Normalized form: lowercase, punctuation-free, whitespace-collapsed. */
export function normalizeFoodName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    // Apostrophes are dropped rather than spaced, so "shepherd's pie" stays a
    // two-word name instead of becoming "shepherd s pie".
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripQualifierWords(segment: string): string {
  const kept = segment
    .split(' ')
    .filter((word) => word && !QUALIFIER_WORDS.has(word));
  return kept.join(' ').trim();
}

/** A segment that only describes preparation is no help in naming a dish. */
export function isQualifierSegment(segment: string): boolean {
  const words = segment.split(' ').filter(Boolean);
  return words.length > 0 && words.every((word) => QUALIFIER_WORDS.has(word));
}

/**
 * Whether a segment can stand on its own as a food name. A single describing word
 * is enough to make it something else: "chinese restaurant" is a venue, not a dish.
 */
export function isSearchableAlone(segment: string): boolean {
  if (segment.length < 4) return false;

  const words = segment.split(' ').filter(Boolean);
  return words.every((word) => !QUALIFIER_WORDS.has(word) && !NON_DISH_MODIFIERS.has(word));
}

/** "pasta with sauce" / "chicken and rice" -> "pasta" / "chicken" */
export function headOf(value: string): string {
  return value.split(/\s+(?:with|without|and|in|on|from)\s+/)[0];
}

/**
 * Turns one food name into match terms ordered most-specific first.
 *
 * Reversing the comma segments is what recovers the real dish name from the
 * provider's category-first ordering, and it is what makes a per-dish image
 * possible at all: "soup, tomato, canned" yields "tomato soup" before "soup".
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

  const base = segments[0];

  // Some entries are recipe descriptions rather than names ("seven-layer salad,
  // lettuce salad made with a combination of onion, celery, ..."). Their later
  // segments are ingredients, so matching them finds the ingredient (mayonnaise)
  // instead of the dish; the leading name is all that is meaningful.
  const isIngredientList =
    /\band or\b|\bmade with\b|\bcombination of\b/.test(normalized) ||
    segments.length > 5 ||
    normalized.length > 70;

  const detail = isIngredientList
    ? []
    : segments.slice(1).filter((segment) => !isQualifierSegment(segment));

  if (detail.length) {
    add(`${detail[detail.length - 1]} ${base}`);
    add(`${base} ${detail[0]}`);
    add(`${detail[0]} ${base}`);

    // A dish often stands alone under its own name: "soup, pozole" -> "pozole".
    for (let i = detail.length - 1; i >= 0; i -= 1) {
      if (isSearchableAlone(detail[i])) add(detail[i]);
    }
  }

  // "macaroni or pasta salad with egg" — the dish usually sits in the last
  // alternative, the earlier ones being a broader synonym.
  if (base.includes(' or ')) {
    for (const alternative of base.split(' or ').reverse()) {
      add(alternative);
      add(headOf(alternative));
    }
  }

  // Progressively drop trailing comma segments: most detail first, base food last.
  for (let count = segments.length; count >= 1; count -= 1) {
    add(segments.slice(0, count).join(' '));
  }

  add(base);
  add(stripQualifierWords(base));
  add(headOf(base));
  add(stripQualifierWords(headOf(base)));

  return candidates;
}
