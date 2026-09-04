/** Lowercase alphanumeric tokens used to compare a USDA label with a provider hit. */
export function labelTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

/**
 * How well a provider result matches the lookup term we searched with.
 * Returns 0–1; callers pick a floor (typically 0.45) before accepting a hit.
 */
export function scoreLabelMatch(query: string, candidateLabel: string): number {
  const queryWords = labelTokens(query);
  const labelWords = labelTokens(candidateLabel);
  if (!queryWords.size || !labelWords.size) return 0;

  let overlap = 0;
  for (const word of queryWords) {
    if (labelWords.has(word)) overlap += 1;
  }

  const queryCoverage = overlap / queryWords.size;
  const labelCoverage = overlap / labelWords.size;
  return Math.max(queryCoverage, queryCoverage * 0.7 + labelCoverage * 0.3);
}
