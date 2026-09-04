import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CURATED_FOOD_IMAGES } from '../services/foodImageCatalog.ts';

const OUTPUT_SIZE = 512;
const WEBP_QUALITY = 82;
const USER_AGENT = 'oq-agile-athletes/1.0 (food image asset builder)';
/**
 * upload.wikimedia.org throttles a single IP hard over a few hundred requests, and
 * a throttled download is indistinguishable from a missing one. Downloading two at
 * a time with a short pause keeps the failure rate near zero; anything that still
 * fails is picked up by re-running, since existing files are left alone.
 */
const DOWNLOAD_CONCURRENCY = 2;
const DOWNLOAD_SPACING_MS = 120;

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const imagesDir = path.join(repoRoot, 'public', 'food-images');

interface Credit {
  file: string;
  concept: string;
  commonsFile: string;
  sourcePage: string;
  artist: string;
  license: string;
  licenseUrl: string;
}

/** Concept keys become filenames, so they need to survive a URL path unescaped. */
function slugify(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Pulls the Commons filename out of an image URL.
 *
 * pageimages returns a thumbnail for most files but the original for ones already
 * small enough, and only the former has a /thumb/ segment:
 *   .../commons/thumb/3/3f/Pasta.jpg/330px-Pasta.jpg -> Pasta.jpg
 *   .../commons/0/02/Water.jpg                       -> Water.jpg
 */
function commonsFileFromThumbUrl(url: string): string | undefined {
  const thumb = url.match(/\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\//);
  const original = url.match(/\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)$/);
  const name = thumb?.[1] ?? original?.[1];
  if (!name) return undefined;

  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** Asks for a larger rendition than the catalog's 330px so the 512px crop isn't upscaled. */
function upscaleThumbUrl(url: string): string {
  return url.replace(/\/(\d+)px-/, `/${OUTPUT_SIZE * 2}px-`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function fetchBytes(url: string): Promise<Buffer | undefined> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      // Commons answers 400 when the requested thumbnail is wider than the original
      // and 404/410 when the file is gone. Neither improves on retry — fall back.
      if (res.status === 400 || res.status === 404 || res.status === 410) return undefined;

      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1));
    } catch {
      await sleep(1500 * (attempt + 1));
    }
  }
  return undefined;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** extmetadata values are HTML fragments (Artist is usually an anchor tag). */
function stripHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface CommonsMetadata {
  artist: string;
  license: string;
  licenseUrl: string;
}

/**
 * Commons treats underscores and spaces as the same character in titles and echoes
 * them back spaced, so both sides of the metadata lookup are keyed on this form.
 */
function normalizeCommonsTitle(file: string): string {
  return file.replace(/_/g, ' ').trim();
}

/**
 * Fetches author/licence for a batch of Commons files.
 * Self-hosting the bytes means we take on the attribution obligation, so this is
 * recorded alongside the assets rather than left implicit in a remote URL.
 */
async function fetchCommonsMetadata(files: string[]): Promise<Map<string, CommonsMetadata>> {
  const out = new Map<string, CommonsMetadata>();

  for (const batch of chunk(files, 40)) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'imageinfo',
      iiprop: 'extmetadata',
      titles: batch.map((file) => `File:${file}`).join('|'),
    });

    try {
      const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (!res.ok) {
        console.log(`  metadata batch failed: HTTP ${res.status}`);
        continue;
      }

      const json = (await res.json()) as {
        query?: { pages?: Array<{ title?: string; imageinfo?: Array<{ extmetadata?: Record<string, { value?: unknown }> }> }> };
      };

      for (const page of json.query?.pages ?? []) {
        const meta = page.imageinfo?.[0]?.extmetadata;
        if (!page.title || !meta) continue;
        out.set(normalizeCommonsTitle(page.title.replace(/^File:/, '')), {
          artist: stripHtml(meta.Artist?.value) || 'Unknown',
          license: stripHtml(meta.LicenseShortName?.value) || 'See Commons file page',
          licenseUrl: stripHtml(meta.LicenseUrl?.value),
        });
      }
    } catch (error) {
      console.log(`  metadata batch failed: ${(error as Error).message}`);
    }

    await sleep(300);
  }

  return out;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main(): Promise<void> {
  await mkdir(imagesDir, { recursive: true });

  const entries = Object.entries(CURATED_FOOD_IMAGES);
  console.log(`Building ${entries.length} food image assets at ${OUTPUT_SIZE}x${OUTPUT_SIZE}...`);

  let reused = 0;
  let downloaded = 0;
  const failed: string[] = [];

  const built = await mapWithConcurrency(entries, DOWNLOAD_CONCURRENCY, async ([key, url]) => {
    const slug = slugify(key);
    const outPath = path.join(imagesDir, `${slug}.webp`);
    const row = { key, slug, url, commonsFile: commonsFileFromThumbUrl(url) };

    // Re-running is the recovery path for throttled downloads, so never redo one
    // that already produced a file. Delete a file to force it to be rebuilt.
    if (await fileExists(outPath)) {
      reused += 1;
      return row;
    }

    // Prefer the 1024px rendition; fall back to the catalog URL, which is the size
    // Commons vouched for (some originals are narrower than the upscale we ask for).
    const bytes = (await fetchBytes(upscaleThumbUrl(url))) ?? (await fetchBytes(url));
    await sleep(DOWNLOAD_SPACING_MS);

    if (!bytes) {
      failed.push(key);
      return undefined;
    }

    try {
      await sharp(bytes)
        .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover', position: 'centre' })
        .webp({ quality: WEBP_QUALITY })
        .toFile(outPath);
    } catch (error) {
      console.log(`  SKIP ${key} — convert failed: ${(error as Error).message}`);
      failed.push(key);
      return undefined;
    }

    downloaded += 1;
    return row;
  });

  const ok = built.filter((row): row is NonNullable<typeof row> => Boolean(row));
  console.log(`Reused ${reused}, downloaded ${downloaded}, failed ${failed.length}.`);
  console.log('Fetching attribution...');

  const metadata = await fetchCommonsMetadata(
    Array.from(new Set(ok.map((row) => row.commonsFile).filter((file): file is string => Boolean(file))))
  );

  const missingAttribution: string[] = [];

  const credits: Credit[] = ok.map((row) => {
    const meta = row.commonsFile ? metadata.get(normalizeCommonsTitle(row.commonsFile)) : undefined;
    if (!meta) missingAttribution.push(row.key);
    return {
      file: `${row.slug}.webp`,
      concept: row.key,
      commonsFile: row.commonsFile ?? '',
      sourcePage: row.commonsFile
        ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(row.commonsFile.replace(/ /g, '_'))}`
        : row.url,
      artist: meta?.artist ?? 'Unknown',
      license: meta?.license ?? 'See Commons file page',
      licenseUrl: meta?.licenseUrl ?? '',
    };
  });

  await writeFile(
    path.join(imagesDir, 'credits.json'),
    `${JSON.stringify(
      {
        note: 'Derived from Wikimedia Commons. Images are cropped/resized; licences are per-file.',
        generated: new Date().toISOString().slice(0, 10),
        images: credits,
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const body = ok
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => `  '${row.key.replace(/'/g, "\\'")}': '/food-images/${row.slug}.webp',`)
    .join('\n');

  const module = `/**
 * Self-hosted food thumbnails, keyed by food concept.
 *
 * GENERATED FILE — do not edit by hand. Rebuild with:
 *   node --import tsx scripts/buildFoodImageAssets.ts
 *
 * Paths are served by express.static from public/food-images. They are returned to
 * clients as-is; the app resolves relative paths against SERVER_URL.
 *
 * Attribution for every file lives in public/food-images/credits.json.
 *
 * Generated ${new Date().toISOString().slice(0, 10)} with ${ok.length} concepts.
 */
export const LOCAL_FOOD_IMAGES: Record<string, string> = {
${body}
};

/** Longest keys first so "brown rice" wins over "rice" during substring matching. */
export const LOCAL_FOOD_KEYS_BY_SPECIFICITY: string[] = Object.keys(LOCAL_FOOD_IMAGES).sort(
  (a, b) => b.length - a.length
);
`;

  await writeFile(path.join(repoRoot, 'services', 'foodImageAssets.ts'), module, 'utf8');

  console.log(`\n${ok.length}/${entries.length} concepts have assets in public/food-images/`);
  console.log('Wrote public/food-images/credits.json');
  console.log('Wrote services/foodImageAssets.ts');

  if (missingAttribution.length) {
    console.log(
      `\nWARNING: no attribution resolved for ${missingAttribution.length} file(s). ` +
        'Check these on Commons before shipping:'
    );
    console.log(`  ${missingAttribution.join(', ')}`);
  }

  if (failed.length) {
    console.log(
      `\n${failed.length} still missing — re-run to retry just these (throttling is the usual cause):`
    );
    console.log(`  ${failed.join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
