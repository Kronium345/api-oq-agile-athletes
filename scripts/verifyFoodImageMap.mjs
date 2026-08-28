/**
 * Checks every URL in services/foodImageCatalog.ts still resolves.
 *
 *   node scripts/verifyFoodImageMap.mjs
 *
 * Exits non-zero only if a thumbnail is actually gone (404/410), so this can gate
 * a release. Expect a batch of "could not confirm" HTTP 429s: upload.wikimedia.org
 * throttles a single IP making a few hundred requests. That is a property of this
 * script, not of the URLs — app users each load from their own address.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const USER_AGENT = 'oq-agile-athletes/1.0 (food image map verifier)';
/** Sequential with pacing: parallel requests just trigger the throttle sooner. */
const CONCURRENCY = 1;
const PACING_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function check(url) {
  let lastError = 'unknown';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) return { state: 'ok' };
      if (res.status === 404 || res.status === 410) {
        return { state: 'dead', reason: `HTTP ${res.status}` };
      }

      lastError = `HTTP ${res.status}`;
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 3000 * (attempt + 1)
      );
    } catch (err) {
      lastError = err?.cause?.message || err?.message || String(err);
      await sleep(2000 * (attempt + 1));
    }
  }

  return { state: 'unknown', reason: lastError };
}

async function main() {
  const catalogPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'services',
    'foodImageCatalog.ts'
  );
  const source = await readFile(catalogPath, 'utf8');

  const entries = [...source.matchAll(/^\s*'([^']+)':\s*'(https:[^']+)',$/gm)].map((m) => ({
    key: m[1],
    url: m[2],
  }));

  if (!entries.length) {
    console.error('No entries parsed from foodImageCatalog.ts');
    process.exit(1);
  }

  console.log(`Checking ${entries.length} thumbnails...`);

  const dead = [];
  const unknown = [];
  let done = 0;
  const queue = [...entries];

  async function worker() {
    while (queue.length) {
      const entry = queue.shift();
      const result = await check(entry.url);
      done += 1;

      if (result.state === 'dead') dead.push(`${entry.key}: ${result.reason}`);
      if (result.state === 'unknown') unknown.push(`${entry.key}: ${result.reason}`);
      if (done % 20 === 0) console.log(`  ${done}/${entries.length}`);

      await sleep(PACING_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\nOK: ${entries.length - dead.length - unknown.length}/${entries.length}`);

  if (unknown.length) {
    console.log(`\nCould not confirm (${unknown.length}):`);
    for (const u of unknown) console.log(`  - ${u}`);
  }

  if (dead.length) {
    console.log(`\nDEAD (${dead.length}) — regenerate the catalog:`);
    for (const d of dead) console.log(`  - ${d}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
