import { Collection, ObjectId } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';
import type { FoodItemWithNutrition } from '../services/foodService.ts';

const FOOD_SCAN_TABLE = process.env.MONGO_FOOD_SCAN_COLLECTION || 'food_scans';

export interface FoodScanDocument {
  _id?: ObjectId;
  userId: string;
  date: Date;
  foodItems: FoodItemWithNutrition[];
}

function getFoodScanCollection(): Collection<FoodScanDocument> {
  const client = getMongoClient();
  return client.db(getMongoDbName()).collection<FoodScanDocument>(FOOD_SCAN_TABLE);
}

function serializeScan(doc: FoodScanDocument) {
  return {
    ...doc,
    _id: doc._id?.toString(),
    date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
  };
}

async function createFoodScan(
  userId: string,
  foodItems: FoodItemWithNutrition[],
  date = new Date()
): Promise<FoodScanDocument> {
  const collection = getFoodScanCollection();
  const doc: FoodScanDocument = { userId, foodItems, date };
  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

async function getFoodScansByUserId(userId: string): Promise<FoodScanDocument[]> {
  return getFoodScanCollection().find({ userId }).sort({ date: -1 }).toArray();
}

async function getFoodScanById(userId: string, id: string): Promise<FoodScanDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  return getFoodScanCollection().findOne({ _id: new ObjectId(id), userId });
}

async function deleteFoodScan(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const result = await getFoodScanCollection().deleteOne({ _id: new ObjectId(id), userId });
  return result.deletedCount === 1;
}

async function findScansInRange(
  start: Date,
  end: Date,
  userId?: string
): Promise<FoodScanDocument[]> {
  const filter: Record<string, unknown> = {
    date: { $gte: start, $lte: end },
  };
  if (userId) filter.userId = userId;
  return getFoodScanCollection().find(filter).sort({ date: -1 }).toArray();
}

async function deleteFoodScansByUserId(userId: string): Promise<number> {
  const result = await getFoodScanCollection().deleteMany({ userId });
  return result.deletedCount;
}

export {
  createFoodScan,
  deleteFoodScan,
  deleteFoodScansByUserId,
  findScansInRange,
  getFoodScanById,
  getFoodScansByUserId,
  serializeScan,
};
