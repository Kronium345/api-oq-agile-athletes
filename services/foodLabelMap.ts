/**
 * Normalizes Gemini food labels into FitVete-friendly search queries.
 * Unknown labels pass through unchanged.
 */
export const FOOD_LABEL_MAP: Record<string, string> = {
  'rotisserie chicken': 'grilled chicken breast',
  'grilled chicken': 'grilled chicken breast',
  'chicken pieces': 'chicken breast',
  'packaged chicken': 'chicken breast',
  'meal prep chicken': 'chicken breast',
  'chicken salad': 'chicken salad',
  'fried chicken': 'fried chicken',
  'chicken wings': 'chicken wings',
  'apple pie': 'apple pie',
  pizza: 'pizza',
  'pepperoni pizza': 'pepperoni pizza',
  pasta: 'pasta',
  spaghetti: 'spaghetti',
  salad: 'green salad',
  hamburger: 'hamburger',
  burger: 'hamburger',
  fries: 'french fries',
  'french fries': 'french fries',
  rice: 'white rice',
  'white rice': 'white rice',
  'brown rice': 'brown rice',
};

export function normalizeFoodLabel(rawName: string): string {
  const trimmed = rawName.trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;

  const key = trimmed.toLowerCase();
  if (FOOD_LABEL_MAP[key]) {
    return FOOD_LABEL_MAP[key];
  }

  // Soft aliases: strip leading articles / adjectives that confuse lookup.
  const softened = key
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/\bhomemade\b/gi, '')
    .replace(/\bleftover(s)?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (FOOD_LABEL_MAP[softened]) {
    return FOOD_LABEL_MAP[softened];
  }

  return softened || trimmed;
}
