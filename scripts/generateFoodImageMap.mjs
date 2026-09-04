/**
 * Regenerates the curated food image map in services/foodImageCatalog.ts.
 *
 * URLs come from the Wikimedia pageimages API and are HEAD-checked, so anything
 * confirmed dead is dropped. Run this if thumbnails start 404ing, since Commons
 * files can be renamed or deleted upstream:
 *
 *   node scripts/generateFoodImageMap.mjs
 *
 * Expect some entries to be reported as "kept unverified": upload.wikimedia.org
 * throttles a single IP over a few hundred requests, and a 429 is not evidence of
 * a dead link.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THUMB_SIZE = 320;
const USER_AGENT = 'oq-agile-athletes/1.0 (food image map generator)';

/**
 * category key -> Wikipedia article title to pull the lead image from.
 * The key is what food names get normalized down to at runtime.
 */
const CATEGORIES = {
  pasta: 'Pasta',
  spaghetti: 'Spaghetti',
  macaroni: 'Macaroni',
  lasagna: 'Lasagne',
  noodles: 'Noodle',
  ramen: 'Ramen',
  // Prefer articles whose lead image is the prepared food over the growing plant.
  rice: 'Cooked rice',
  'brown rice': 'Brown rice',
  'white rice': 'White rice',
  'fried rice': 'Fried rice',
  quinoa: 'Quinoa',
  couscous: 'Couscous',
  bread: 'Bread',
  bagel: 'Bagel',
  toast: 'Toast (food)',
  tortilla: 'Tortilla',
  croissant: 'Croissant',
  pizza: 'Pizza',
  hamburger: 'Hamburger',
  sandwich: 'Sandwich',
  'hot dog': 'Hot dog',
  taco: 'Taco',
  burrito: 'Burrito',
  wrap: 'Wrap (food)',
  sushi: 'Sushi',
  curry: 'Curry',
  soup: 'Soup',
  stew: 'Stew',
  salad: 'Salad',
  // 'Chicken as food' leads with live chickens in a market; this is the cooked dish.
  chicken: 'Roast chicken',
  'fried chicken': 'Fried chicken',
  'chicken wings': 'Buffalo wing',
  turkey: 'Turkey as food',
  beef: 'Beef',
  steak: 'Steak',
  pork: 'Pork',
  bacon: 'Bacon',
  ham: 'Ham',
  sausage: 'Sausage',
  lamb: 'Lamb and mutton',
  fish: 'Fish as food',
  salmon: 'Salmon as food',
  // 'Tuna' leads with a species illustration served unscaled; this is the edible form.
  tuna: 'Canned fish',
  shrimp: 'Shrimp and prawn as food',
  egg: 'Egg as food',
  omelette: 'Omelette',
  milk: 'Milk',
  cheese: 'Cheese',
  yogurt: 'Yogurt',
  butter: 'Butter',
  'ice cream': 'Ice cream',
  chocolate: 'Chocolate',
  cake: 'Cake',
  cheesecake: 'Cheesecake',
  cookie: 'Cookie',
  doughnut: 'Doughnut',
  pie: 'Pie',
  pancake: 'Pancake',
  waffle: 'Waffle',
  apple: 'Apple',
  banana: 'Banana',
  orange: 'Orange (fruit)',
  strawberry: 'Strawberry',
  blueberry: 'Blueberry',
  raspberry: 'Raspberry',
  grape: 'Grape',
  mango: 'Mango',
  pineapple: 'Pineapple',
  watermelon: 'Watermelon',
  peach: 'Peach',
  pear: 'Pear',
  avocado: 'Avocado',
  fruit: 'Fruit',
  potato: 'Potato',
  'french fries': 'French fries',
  'sweet potato': 'Sweet potato',
  tomato: 'Tomato',
  carrot: 'Carrot',
  broccoli: 'Broccoli',
  spinach: 'Spinach',
  lettuce: 'Lettuce',
  cucumber: 'Cucumber',
  onion: 'Onion',
  pepper: 'Bell pepper',
  mushroom: 'Edible mushroom',
  corn: 'Sweet corn',
  peas: 'Pea',
  vegetable: 'Vegetable',
  beans: 'Bean',
  lentils: 'Lentil',
  chickpeas: 'Chickpea',
  tofu: 'Tofu',
  hummus: 'Hummus',
  'peanut butter': 'Peanut butter',
  peanut: 'Peanut',
  almond: 'Almond',
  walnut: 'Walnut',
  cashew: 'Cashew',
  nuts: 'Mixed nuts',
  oatmeal: 'Oatmeal',
  cereal: 'Breakfast cereal',
  granola: 'Granola',
  honey: 'Honey',
  sugar: 'Sugar',
  'olive oil': 'Olive oil',
  coffee: 'Coffee',
  tea: 'Tea',
  juice: 'Juice',
  smoothie: 'Smoothie',
  soda: 'Soft drink',
  water: 'Bottled water',
  beer: 'Beer',
  wine: 'Wine',
  'protein shake': 'Whey protein',
  'protein bar': 'Energy bar',
  popcorn: 'Popcorn',
  'potato chips': 'Potato chip',
  pretzel: 'Pretzel',
  biryani: 'Biryani',
  naan: 'Naan',
  paneer: 'Paneer',
  samosa: 'Samosa',
  dosa: 'Dosa (food)',
  kebab: 'Kebab',
  shawarma: 'Shawarma',
  falafel: 'Falafel',
  dumpling: 'Dumpling',
  'pad thai': 'Pad thai',
  pho: 'Pho',
  risotto: 'Risotto',
  'rice and beans': 'Rice and beans',

  // Named soups and stews. USDA lists these category-first ("soup, tomato, canned"),
  // so having the dish as its own concept is what stops them all collapsing to 'soup'.
  'tomato soup': 'Tomato soup',
  'chicken soup': 'Chicken soup',
  'lentil soup': 'Lentil soup',
  'onion soup': 'French onion soup',
  'vegetable soup': 'Vegetable soup',
  'noodle soup': 'Noodle soup',
  minestrone: 'Minestrone',
  'clam chowder': 'Clam chowder',
  borscht: 'Borscht',
  gumbo: 'Gumbo',
  pozole: 'Pozole',
  congee: 'Congee',
  wonton: 'Wonton',
  chili: 'Chili con carne',
  broth: 'Broth',

  // Named salads, same reasoning as soups.
  'pasta salad': 'Pasta salad',
  'macaroni salad': 'Macaroni salad',
  'potato salad': 'Potato salad',
  coleslaw: 'Coleslaw',
  'caesar salad': 'Caesar salad',
  'greek salad': 'Greek salad',
  'fruit salad': 'Fruit salad',
  'tuna salad': 'Tuna salad',
  'egg salad': 'Egg salad',
  'chicken salad': 'Chicken salad',

  // Cuts and offal. Prefer '<part> as food' articles: the plain article usually
  // leads with a human anatomy diagram.
  'chicken feet': 'Chicken feet',
  gizzard: 'Gizzard',
  liver: 'Liver as food',
  'roast beef': 'Roast beef',
  'ground beef': 'Ground beef',
  meatball: 'Meatball',
  meatloaf: 'Meatloaf',
  pastrami: 'Pastrami',
  salami: 'Salami',
  pepperoni: 'Pepperoni',
  jerky: 'Jerky',
  ribs: 'Pork ribs',
  brisket: 'Brisket',
  duck: 'Duck as food',
  venison: 'Venison',

  // Seafood, again favouring the edible-form article over the species article.
  'crab meat': 'Crab meat',
  calamari: 'Squid as food',
  'fish and chips': 'Fish and chips',
  sashimi: 'Sashimi',
  tempura: 'Tempura',

  'scrambled eggs': 'Scrambled eggs',
  'boiled egg': 'Boiled egg',
  'fried egg': 'Fried egg',
  'deviled egg': 'Deviled egg',

  cheddar: 'Cheddar cheese',
  mozzarella: 'Mozzarella',
  parmesan: 'Parmigiano Reggiano',
  feta: 'Feta',
  'cottage cheese': 'Cottage cheese',
  'cream cheese': 'Cream cheese',
  'sour cream': 'Sour cream',
  'whipped cream': 'Whipped cream',
  cream: 'Cream',
  milkshake: 'Milkshake',

  'pound cake': 'Pound cake',
  'sponge cake': 'Sponge cake',
  'carrot cake': 'Carrot cake',
  brownie: 'Chocolate brownie',
  muffin: 'Muffin',
  cupcake: 'Cupcake',
  pudding: 'Pudding',
  custard: 'Custard',
  'gelatin dessert': 'Gelatin dessert',
  macaron: 'Macaron',
  tart: 'Tart',
  scone: 'Scone',
  'french toast': 'French toast',
  crepe: 'Crêpe',
  churro: 'Churro',
  baklava: 'Baklava',
  tiramisu: 'Tiramisu',

  porridge: 'Porridge',
  grits: 'Grits',
  polenta: 'Polenta',
  bulgur: 'Bulgur',
  'rice noodles': 'Rice noodles',
  'glutinous rice': 'Glutinous rice',
  'rice pudding': 'Rice pudding',

  sourdough: 'Sourdough',
  'rye bread': 'Rye bread',
  pita: 'Pita',
  roti: 'Roti',
  cornbread: 'Cornbread',
  biscuit: 'Biscuit',
  baguette: 'Baguette',
  'garlic bread': 'Garlic bread',

  asparagus: 'Asparagus',
  cauliflower: 'Cauliflower',
  cabbage: 'Cabbage',
  kale: 'Kale',
  celery: 'Celery',
  zucchini: 'Zucchini',
  eggplant: 'Eggplant',
  beet: 'Beetroot',
  pumpkin: 'Pumpkin',
  squash: 'Butternut squash',
  'brussels sprouts': 'Brussels sprout',
  'green beans': 'Green bean',
  okra: 'Okra',
  artichoke: 'Artichoke',
  garlic: 'Garlic',
  ginger: 'Ginger',
  olive: 'Olive',
  pickle: 'Pickled cucumber',
  sauerkraut: 'Sauerkraut',
  kimchi: 'Kimchi',
  'hash browns': 'Hash browns',
  'mashed potato': 'Mashed potato',
  'baked potato': 'Baked potato',

  cherry: 'Cherry',
  plum: 'Plum',
  apricot: 'Apricot',
  kiwi: 'Kiwifruit',
  papaya: 'Papaya',
  pomegranate: 'Pomegranate',
  fig: 'Common fig',
  lemon: 'Lemon',
  lime: 'Lime (fruit)',
  grapefruit: 'Grapefruit',
  cantaloupe: 'Cantaloupe',
  coconut: 'Coconut',
  cranberry: 'Cranberry',
  blackberry: 'Blackberry',
  raisin: 'Raisin',

  salsa: 'Salsa (sauce)',
  guacamole: 'Guacamole',
  ketchup: 'Ketchup',
  mustard: 'Mustard (condiment)',
  mayonnaise: 'Mayonnaise',
  'soy sauce': 'Soy sauce',
  gravy: 'Gravy',
  pesto: 'Pesto',
  jam: 'Fruit preserves',
  syrup: 'Maple syrup',
  sauce: 'Sauce',

  edamame: 'Edamame',
  'black beans': 'Black turtle bean',
  'baked beans': 'Baked beans',
  pistachio: 'Pistachio',
  pecan: 'Pecan',
  'sunflower seeds': 'Sunflower seed',
  'chia seeds': 'Chia seed',
  sesame: 'Sesame',
  tempeh: 'Tempeh',
  'soy milk': 'Soy milk',
  'almond milk': 'Almond milk',
  'oat milk': 'Oat milk',

  quesadilla: 'Quesadilla',
  nachos: 'Nachos',
  enchilada: 'Enchilada',
  tamale: 'Tamale',
  empanada: 'Empanada',
  'spring roll': 'Spring roll',
  'chow mein': 'Chow mein',
  bibimbap: 'Bibimbap',
  teriyaki: 'Teriyaki',
  'dim sum': 'Dim sum',
  satay: 'Satay',
  gyro: 'Gyro (food)',
  paella: 'Paella',
  gnocchi: 'Gnocchi',
  ravioli: 'Ravioli',
  carbonara: 'Carbonara',
  'mac and cheese': 'Macaroni and cheese',
  bolognese: 'Bolognese sauce',
  // Keys must match normalizeFoodName output, which strips apostrophes.
  'shepherds pie': "Shepherd's pie",
  'pot pie': 'Pot pie',
  quiche: 'Quiche',
  'stir fry': 'Stir frying',

  'hot chocolate': 'Hot chocolate',
  lemonade: 'Lemonade',
  'energy drink': 'Energy drink',
  kombucha: 'Kombucha',

  cheeseburger: 'Cheeseburger',
  'grilled cheese': 'Cheese sandwich',
  blt: 'BLT',
  'club sandwich': 'Club sandwich',
  'sausage roll': 'Sausage roll',
};

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Wikimedia thumbnail URLs come back with analytics query params we don't want to store. */
function cleanUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

async function fetchThumbnails(titles) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: String(THUMB_SIZE),
    redirects: '1',
    titles: titles.join('|'),
  });

  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Wikipedia query failed: ${res.status}`);

  const json = await res.json();
  const byTitle = new Map();

  // `redirects`/`normalized` let us map the resolved page back to the title we asked for.
  const aliases = new Map();
  for (const entry of json.query?.normalized ?? []) aliases.set(entry.to, entry.from);
  for (const entry of json.query?.redirects ?? []) aliases.set(entry.to, entry.from);

  for (const page of json.query?.pages ?? []) {
    if (!page.thumbnail?.source) continue;
    let title = page.title;
    // Walk the alias chain back to the requested title.
    for (let i = 0; i < 5 && aliases.has(title); i += 1) title = aliases.get(title);
    byTitle.set(title, cleanUrl(page.thumbnail.source));
  }

  return byTitle;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Verifies a thumbnail still exists.
 *
 * The point of the check is to catch files renamed or deleted on Commons, which
 * surface as 404/410. Anything else — throttling, transient network failure — is
 * not evidence of a dead link, so the URL is kept and reported as unverified,
 * since the pageimages API already vouched for it.
 */
async function urlResolves(url) {
  let lastError = 'unknown';

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': USER_AGENT },
      });
      if (res.ok) return { ok: true, verified: true };
      if (res.status === 404 || res.status === 410) {
        return { ok: false, reason: `HTTP ${res.status}` };
      }

      lastError = `HTTP ${res.status}`;
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1)
      );
    } catch (err) {
      lastError = err?.cause?.message || err?.message || String(err);
      await sleep(1000 * (attempt + 1));
    }
  }

  return { ok: true, verified: false, reason: lastError };
}

async function main() {
  const titles = Object.values(CATEGORIES);
  const resolved = new Map();

  for (const batch of chunk(titles, 40)) {
    const found = await fetchThumbnails(batch);
    for (const [title, url] of found) resolved.set(title, url);
  }

  const entries = [];
  const missing = [];
  const unverified = [];

  for (const [key, title] of Object.entries(CATEGORIES)) {
    const url = resolved.get(title);
    if (!url) {
      missing.push(`${key} (${title}) — no lead image`);
      continue;
    }

    const check = await urlResolves(url);
    if (!check.ok) {
      missing.push(`${key} (${title}) — dead link: ${check.reason}`);
      continue;
    }
    if (!check.verified) {
      unverified.push(`${key} (${title}) — kept unverified: ${check.reason}`);
    }

    entries.push([key, url]);
    await sleep(150);
  }

  const body = entries
    .map(([key, url]) => `  '${key.replace(/'/g, "\\'")}': '${url}',`)
    .join('\n');

  const file = `/**
 * Curated food-category thumbnails, keyed by normalized category name.
 *
 * GENERATED FILE — do not edit by hand. Regenerate with:
 *   node scripts/generateFoodImageMap.mjs
 *
 * Images are Wikimedia Commons thumbnails returned by the pageimages API, which
 * only yields a thumbnail for a file that exists. Entries confirmed dead (404/410)
 * are dropped at generation time. Re-check anytime with:
 *   node scripts/verifyFoodImageMap.mjs
 *
 * Generated ${new Date().toISOString().slice(0, 10)} with ${entries.length} categories.
 */
export const CURATED_FOOD_IMAGES: Record<string, string> = {
${body}
};

/** Longest keys first so "brown rice" wins over "rice" during substring matching. */
export const CURATED_FOOD_KEYS_BY_SPECIFICITY: string[] = Object.keys(CURATED_FOOD_IMAGES).sort(
  (a, b) => b.length - a.length
);
`;

  const outPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'services',
    'foodImageCatalog.ts'
  );
  await writeFile(outPath, file, 'utf8');

  console.log(`Wrote ${entries.length} categories to services/foodImageCatalog.ts`);
  if (unverified.length) {
    console.log(`\nKept but not HEAD-verified (${unverified.length}):`);
    for (const u of unverified) console.log(`  - ${u}`);
  }
  if (missing.length) {
    console.log(`\nSkipped ${missing.length}:`);
    for (const m of missing) console.log(`  - ${m}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
