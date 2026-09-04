/**
 * Manual check of food-name -> thumbnail resolution.
 *
 *   node --import tsx scripts/tryFoodImageResolve.ts [name...]
 *
 * Exercises the live path: the self-hosted catalog in public/food-images, matched
 * offline with no network call and no Mongo. Use it when adding concepts, or to see
 * why a name picked the thumbnail it did — `tier` tells you which rule fired:
 *
 *   exact     a match term is a catalog concept verbatim
 *   parent    a broader form of a match term is  ("chicken breast" -> "chicken")
 *   category  a concept appears as a whole word inside a match term
 *   none      no confident match; the app shows its placeholder
 */
import { buildSearchCandidates } from '../services/foodImageNames.ts';
import { getFoodImageCatalogSize, resolveFoodImage } from '../services/foodImageResolver.ts';

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
      // Shapes that used to resolve to something wrong.
      'chicken, back, meat and skin, raw',
      'chicken, liver, all classes, cooked, simmered',
      'rice, white, steamed, chinese restaurant',
      'soup, tomato, canned, condensed',
      'seven-layer salad, lettuce salad made with a combination of onion, celery',
      // Other common shapes.
      'brown rice, cooked',
      'chicken breast, grilled',
      'greek yogurt, plain, nonfat',
      'apples, raw, with skin',
      'scrambled eggs',
      'peanut butter, smooth',
      'protein shake, whey',
      'kimchi jjigae',
      'zzzunknownfood',
    ];

console.log(`Catalog: ${getFoodImageCatalogSize()} concepts in public/food-images\n`);

let hits = 0;

for (const name of NAMES) {
  const match = resolveFoodImage(name);
  if (match) hits += 1;

  console.log(name);
  console.log(`  terms: ${buildSearchCandidates(name).join(' | ')}`);
  console.log(
    `  ${(match?.imageSource ?? 'none').padEnd(9)} ${match ? `${match.imageKey}  ->  ${match.imageUrl}` : '—  (placeholder)'}`
  );
}

console.log(`\n${hits}/${NAMES.length} resolved`);
