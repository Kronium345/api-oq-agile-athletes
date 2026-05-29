import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const CALORIE_PREFERENCES_TABLE =
  process.env.MONGO_CALORIE_PREFERENCES_COLLECTION || 'calorie_preferences';

export type ActivityLevel = 'Little' | 'Light' | 'Moderate' | 'Heavy';

export interface MealPreferences {
  breakfast: boolean;
  morningSnack: boolean;
  lunch: boolean;
  afternoonSnack: boolean;
  dinner: boolean;
  eveningSnack: boolean;
}

export interface CaloriePreferencesDocument {
  userId: string;
  currentWeight: number;
  goalWeight?: number;
  dailyCalorieIntake: number;
  activityLevel: ActivityLevel;
  mealPreferences: MealPreferences;
  createdAt: string;
  updatedAt: string;
}

const defaultMealPreferences = (): MealPreferences => ({
  breakfast: false,
  morningSnack: false,
  lunch: false,
  afternoonSnack: false,
  dinner: false,
  eveningSnack: false,
});

function getCaloriePreferencesCollection(): Collection<CaloriePreferencesDocument> {
  const client = getMongoClient();
  return client.db(getMongoDbName()).collection<CaloriePreferencesDocument>(CALORIE_PREFERENCES_TABLE);
}

async function getCaloriePreferences(userId: string): Promise<CaloriePreferencesDocument | null> {
  return getCaloriePreferencesCollection().findOne({ userId });
}

async function upsertCaloriePreferences(
  data: Omit<CaloriePreferencesDocument, 'createdAt' | 'updatedAt'> & { createdAt?: string }
): Promise<CaloriePreferencesDocument> {
  const collection = getCaloriePreferencesCollection();
  const now = new Date().toISOString();
  const existing = await collection.findOne({ userId: data.userId });

  if (existing) {
    const updated: CaloriePreferencesDocument = {
      ...existing,
      ...data,
      mealPreferences: data.mealPreferences ?? existing.mealPreferences,
      updatedAt: now,
    };
    await collection.replaceOne({ userId: data.userId }, updated);
    return updated;
  }

  const created: CaloriePreferencesDocument = {
    userId: data.userId,
    currentWeight: data.currentWeight,
    goalWeight: data.goalWeight,
    dailyCalorieIntake: data.dailyCalorieIntake ?? 0,
    activityLevel: data.activityLevel,
    mealPreferences: data.mealPreferences ?? defaultMealPreferences(),
    createdAt: now,
    updatedAt: now,
  };
  await collection.insertOne(created);
  return created;
}

async function addCaloriesToDailyIntake(userId: string, cal: number): Promise<void> {
  const collection = getCaloriePreferencesCollection();
  const prefs = await collection.findOne({ userId });
  if (!prefs) return;
  await collection.updateOne(
    { userId },
    {
      $inc: { dailyCalorieIntake: cal },
      $set: { updatedAt: new Date().toISOString() },
    }
  );
}

async function deleteCaloriePreferencesByUserId(userId: string): Promise<number> {
  const result = await getCaloriePreferencesCollection().deleteMany({ userId });
  return result.deletedCount;
}

export {
  addCaloriesToDailyIntake,
  deleteCaloriePreferencesByUserId,
  getCaloriePreferences,
  upsertCaloriePreferences,
};
