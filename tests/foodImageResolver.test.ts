import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeConcept,
  getFoodImageCatalogSize,
  resolveFoodImage,
  resolveFoodImageUrl,
} from '../services/foodImageResolver.ts';
import { LOCAL_FOOD_IMAGES } from '../services/foodImageAssets.ts';

/** The concept a name resolves to, or undefined for a deliberate miss. */
function keyFor(name: string): string | undefined {
  return resolveFoodImage(name)?.imageKey;
}

describe('foodImageResolver', () => {
  it('has a catalog to resolve against', () => {
    assert.ok(getFoodImageCatalogSize() > 250, 'expected the generated catalog to be populated');
  });

  it('serves every concept from our own origin', () => {
    for (const [key, url] of Object.entries(LOCAL_FOOD_IMAGES)) {
      assert.match(url, /^\/food-images\/[a-z0-9-]+\.webp$/, `bad path for "${key}": ${url}`);
    }
  });

  it('collapses preparation variants of one food onto the same image', () => {
    const pasta = [
      'Pasta, dry, enriched',
      'Pasta, dry, unenriched',
      'Pasta, cooked, enriched, with added salt',
      'Pasta, cooked, unenriched, without added salt',
    ].map(resolveFoodImageUrl);

    assert.ok(pasta[0], 'expected pasta to resolve');
    assert.equal(new Set(pasta).size, 1, 'preparation variants should share one thumbnail');
  });

  it('keeps named dishes distinct from their category', () => {
    assert.equal(keyFor('Soup, tomato, canned, condensed'), 'tomato soup');
    assert.equal(keyFor('Soup, lentil, canned'), 'lentil soup');
    assert.equal(keyFor('Salad, potato, prepared'), 'potato salad');
    assert.equal(keyFor('Rice, brown, long-grain, cooked'), 'brown rice');

    // A soup we have no specific image for still gets the generic one.
    assert.equal(keyFor('Soup, oxtail, dry mix'), 'soup');
  });

  it('prefers the real food over an umbrella category', () => {
    // "vegetable" is a catalog concept and appears before "pasta" in the match
    // terms, so without the generic-last rule it would win.
    assert.equal(keyFor('Pasta, vegetable, cooked'), 'pasta');
    assert.equal(keyFor('Nuts, almonds'), 'almond');
    assert.equal(keyFor('Fish, salmon, atlantic, raw'), 'salmon');
    assert.equal(keyFor('Cheese, cheddar, sharp'), 'cheddar');
    assert.equal(keyFor('Soup, chicken noodle, canned'), 'noodle soup');

    // The umbrella is still used when nothing more specific exists.
    assert.equal(keyFor('Soup, oxtail, dry mix'), 'soup');
    assert.equal(keyFor('Bread, whole-wheat, commercially prepared'), 'bread');
  });

  it('falls back to the parent concept for cuts and body parts', () => {
    // These are the cases the old Wikipedia lookup got badly wrong: "back" found a
    // human back and "liver" an anatomy diagram.
    assert.equal(keyFor('Chicken, back, meat and skin, raw'), 'chicken');
    assert.equal(keyFor('Chicken, breast, meat only, cooked, roasted'), 'chicken');
    assert.equal(keyFor('Chicken, liver, all classes, cooked, simmered'), 'liver');
  });

  it('ignores ingredient lists in recipe-style names', () => {
    // The trailing ingredients used to win and select a photo of mayonnaise. They
    // must not be matched loosely either, or "lettuce" wins over the dish.
    assert.equal(
      keyFor('Seven-layer salad, lettuce salad made with a combination of onion, celery, mayonnaise'),
      'salad'
    );
  });

  it('is insensitive to singular and plural naming', () => {
    assert.equal(keyFor('Avocados, raw, California'), 'avocado');
    assert.equal(keyFor('Strawberries, raw'), 'strawberry');
    assert.equal(keyFor('Potatoes, boiled, cooked in skin, flesh, without salt'), 'potato');
    assert.equal(keyFor('Egg, whole, cooked, scrambled'), 'scrambled eggs');
  });

  it('never resolves a bare describing word to an image', () => {
    for (const name of ['white', 'fried', 'raw', 'cooked', 'large', 'back', 'instant']) {
      assert.equal(resolveFoodImage(name), null, `"${name}" should not resolve`);
    }
  });

  it('returns null rather than guessing', () => {
    assert.equal(resolveFoodImage('XYZ obscure laboratory reference item'), null);
    assert.equal(resolveFoodImage(''), null);
    assert.equal(resolveFoodImage('   '), null);
  });

  it('reports which tier matched, for debugging a wrong thumbnail', () => {
    assert.equal(resolveFoodImage('Soup, tomato, canned')?.imageSource, 'exact');
    assert.equal(resolveFoodImage('Boneless skinless chicken')?.imageSource, 'parent');
    assert.equal(resolveFoodImage('Leftover roast chicken dinner')?.imageSource, 'category');
  });

  it('keys no two concepts onto the same canonical form', () => {
    // A collision would make plural matching resolve to an arbitrary one of them.
    const seen = new Map<string, string>();
    for (const key of Object.keys(LOCAL_FOOD_IMAGES)) {
      const canonical = canonicalizeConcept(key);
      const existing = seen.get(canonical);
      assert.equal(existing, undefined, `"${key}" and "${existing}" both canonicalize to "${canonical}"`);
      seen.set(canonical, key);
    }
  });

  it('can be switched off entirely', () => {
    const previous = process.env.FOOD_IMAGES_ENABLED;
    process.env.FOOD_IMAGES_ENABLED = 'false';
    try {
      assert.equal(resolveFoodImage('Pasta, dry, enriched'), null);
    } finally {
      if (previous === undefined) delete process.env.FOOD_IMAGES_ENABLED;
      else process.env.FOOD_IMAGES_ENABLED = previous;
    }
  });
});
