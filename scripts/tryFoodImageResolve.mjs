/**
 * Manual check of food-name -> thumbnail resolution.
 *
 *   node scripts/tryFoodImageResolve.mjs [name...]
 *
 * Runs without Mongo: the cache layer degrades to no-op, so this exercises the
 * curated map and the live Wikimedia lookup only.
 */
import {
  buildSearchCandidates,
  findCuratedImage,
  resolveFoodImages,
} from '../services/foodImageService.ts';

const NAMES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      // Real FitVete search output for "pasta".
      'pasta',
      'pasta, cooked',
      'pasta, gluten free',
      'pasta, dry, enriched',
      'pasta, dry, unenriched',
      'pasta, vegetable, cooked',
      'pasta with sauce, nfs',
      // Other common shapes.
      'brown rice, cooked',
      'chicken breast, grilled',
      'greek yogurt, plain, nonfat',
      'apple, raw, with skin',
      'scrambled eggs',
      'peanut butter, smooth',
      'protein shake, whey',
      'kimchi jjigae',
      'zzzunknownfood',
    ];

const shortUrl = (url) => (url ? url.split('/').pop().slice(0, 62) : '—');

const resolved = await resolveFoodImages(NAMES);

for (const name of NAMES) {
  const curated = findCuratedImage(name);
  const url = resolved.get(name);
  const tier = curated ? 'curated' : url ? 'wikipedia' : 'none';

  console.log(`${name}`);
  console.log(`  candidates: ${buildSearchCandidates(name).join(' | ')}`);
  console.log(`  ${tier.padEnd(9)} ${shortUrl(url)}`);
}

const hits = NAMES.filter((n) => resolved.get(n)).length;
console.log(`\n${hits}/${NAMES.length} resolved`);
