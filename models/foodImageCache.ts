import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const FOOD_IMAGE_CACHE_TABLE =
  process.env.MONGO_FOOD_IMAGE_CACHE_COLLECTION || 'food_image_cache';

/** Successful lookups are cheap to keep; misses are retried sooner in case an article gains an image. */
const HIT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface FoodImageCacheDocument {
  /** Normalized food name — see normalizeFoodName in services/foodImageService.ts. */
  key: string;
  /** Absent means "looked up and found nothing", which we cache to avoid re-querying. */
  imageUrl?: string;
  source: string;
  expiresAt: Date;
}

function getCollection(): Collection<FoodImageCacheDocument> {
  const client = getMongoClient();
  return client.db(getMongoDbName()).collection<FoodImageCacheDocument>(FOOD_IMAGE_CACHE_TABLE);
}

let indexesReady = false;

async function ensureIndexes(): Promise<void> {
  if (indexesReady) return;
  const collection = getCollection();
  await collection.createIndex({ key: 1 }, { unique: true });
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  indexesReady = true;
}

export async function readCachedFoodImages(
  keys: string[]
): Promise<Map<string, string | undefined>> {
  const found = new Map<string, string | undefined>();
  if (!keys.length) return found;

  await ensureIndexes();
  const docs = await getCollection()
    .find({ key: { $in: keys } })
    .toArray();

  for (const doc of docs) {
    // A TTL sweep can lag by up to a minute, so honour expiresAt ourselves.
    if (doc.expiresAt instanceof Date && doc.expiresAt.getTime() < Date.now()) continue;
    found.set(doc.key, doc.imageUrl);
  }

  return found;
}

export async function writeCachedFoodImages(
  entries: Array<{ key: string; imageUrl?: string; source: string }>
): Promise<void> {
  if (!entries.length) return;

  await ensureIndexes();
  const now = Date.now();

  await getCollection().bulkWrite(
    entries.map((entry) => ({
      updateOne: {
        filter: { key: entry.key },
        update: {
          $set: {
            imageUrl: entry.imageUrl,
            source: entry.source,
            expiresAt: new Date(now + (entry.imageUrl ? HIT_TTL_MS : MISS_TTL_MS)),
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}
