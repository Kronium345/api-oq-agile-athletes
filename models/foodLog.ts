import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';
import { endOfDay, parseYyyyMmDd, startOfDay } from '../utils/dateRanges.ts';

const FOOD_LOG_TABLE = process.env.MONGO_FOOD_LOG_COLLECTION || 'food_logs';

export interface FoodLogDocument {
  userId: string;
  label: string;
  cal: number;
  carbohydrates: number;
  fats: number;
  proteins: number;
  sugars: number;
  imageUrl: string;
  loggedAt: Date;
}

function getFoodLogCollection(): Collection<FoodLogDocument> {
  const client = getMongoClient();
  return client.db(getMongoDbName()).collection<FoodLogDocument>(FOOD_LOG_TABLE);
}

function serializeLog(doc: FoodLogDocument & { _id?: unknown }) {
  return {
    ...doc,
    _id: doc._id != null ? String(doc._id) : undefined,
    loggedAt: doc.loggedAt instanceof Date ? doc.loggedAt.toISOString() : doc.loggedAt,
  };
}

async function createFoodLog(entry: Omit<FoodLogDocument, 'loggedAt'>): Promise<FoodLogDocument> {
  const collection = getFoodLogCollection();
  const doc: FoodLogDocument = { ...entry, loggedAt: new Date() };
  await collection.insertOne(doc);
  return doc;
}

async function getFoodLogsByUserId(userId: string, dateStr?: string): Promise<FoodLogDocument[]> {
  const filter: Record<string, unknown> = { userId };

  if (dateStr) {
    const day = parseYyyyMmDd(dateStr);
    if (day) {
      filter.loggedAt = { $gte: startOfDay(day), $lte: endOfDay(day) };
    }
  }

  return getFoodLogCollection().find(filter).sort({ loggedAt: -1 }).toArray();
}

async function deleteFoodLogsByUserId(userId: string): Promise<number> {
  const result = await getFoodLogCollection().deleteMany({ userId });
  return result.deletedCount;
}

export {
  createFoodLog,
  deleteFoodLogsByUserId,
  getFoodLogsByUserId,
  serializeLog,
};
