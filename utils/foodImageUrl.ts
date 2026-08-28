/**
 * Placeholder strings that older clients and stored rows use to mean "no image".
 * `'N/A'` in particular is truthy, so passing it through renders a broken image
 * in the app instead of the fallback tile.
 */
const IMAGE_PLACEHOLDERS = new Set(['', 'n/a', 'na', 'none', 'null', 'undefined', '-']);

/** Returns a usable absolute image URL, or undefined for anything unusable. */
export function sanitizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed || IMAGE_PLACEHOLDERS.has(trimmed.toLowerCase())) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) return undefined;

  return trimmed;
}
