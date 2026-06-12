import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const STEP_HISTORY_TABLE = process.env.MONGO_STEP_HISTORY_COLLECTION || 'step_history';

export interface StepHistoryItem {
  userId: string;
  date: string;
  stepCount: number;
  goalAchieved?: boolean;
  createdAt: string;
  updatedAt: string;
}

function getStepHistoryCollection(): Collection<StepHistoryItem> {
  const client = getMongoClient();
  const db = client.db(getMongoDbName());
  return db.collection<StepHistoryItem>(STEP_HISTORY_TABLE);
}

let stepHistoryIndexesEnsured = false;

/** One row per user per calendar date — prevents duplicate step rows on upsert races. */
export async function ensureStepHistoryIndexes(): Promise<void> {
  if (stepHistoryIndexesEnsured) return;
  const col = getStepHistoryCollection();
  await col.createIndex({ userId: 1, date: 1 }, { unique: true });
  await col.createIndex({ userId: 1, date: -1 });
  stepHistoryIndexesEnsured = true;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidStepDate(date: string): boolean {
  return DATE_RE.test(date);
}

async function recordSteps(userId: string, date: string, stepCount: number | string): Promise<StepHistoryItem> {
  const collection = getStepHistoryCollection();
  const now = new Date().toISOString();
  const item: StepHistoryItem = {
    userId,
    date,
    stepCount: Number(stepCount),
    createdAt: now,
    updatedAt: now,
  };

  await collection.updateOne(
    { userId, date },
    { $set: { stepCount: item.stepCount, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  return {
    ...item,
    createdAt: (await getStepsByDate(userId, date))?.createdAt || now,
  };
}

async function getStepHistory(userId: string, startDate: string, endDate: string): Promise<StepHistoryItem[]> {
  const collection = getStepHistoryCollection();
  return collection
    .find({ userId, date: { $gte: startDate, $lte: endDate } })
    .sort({ date: -1 })
    .toArray();
}

/**
 * Get step count for a specific date
 */
async function getStepsByDate(userId: string, date: string): Promise<StepHistoryItem | null> {
  const collection = getStepHistoryCollection();
  return collection.findOne({ userId, date });
}

/**
 * Get total steps for a user (all time or within date range)
 */
async function getTotalSteps(userId: string, startDate: string | null = null, endDate: string | null = null): Promise<number> {
  let items: StepHistoryItem[];

  if (startDate && endDate) {
    items = await getStepHistory(userId, startDate, endDate);
  } else {
    const collection = getStepHistoryCollection();
    items = await collection.find({ userId }).toArray();
  }

  return items.reduce((total, item) => total + (item.stepCount || 0), 0);
}

/**
 * Update step count for a specific date
 */
async function getStepHistoryForUsers(
  userIds: string[],
  startDate: string,
  endDate: string
): Promise<StepHistoryItem[]> {
  if (!userIds.length) return [];
  const collection = getStepHistoryCollection();
  return collection
    .find({
      userId: { $in: userIds },
      date: { $gte: startDate, $lte: endDate },
    })
    .toArray();
}

async function markGoalAchieved(userId: string, date: string): Promise<void> {
  const collection = getStepHistoryCollection();
  await collection.updateOne(
    { userId, date },
    { $set: { goalAchieved: true, updatedAt: new Date().toISOString() } }
  );
}

async function updateSteps(userId: string, date: string, stepCount: number | string): Promise<StepHistoryItem> {
  return recordSteps(userId, date, stepCount);
}

export {
    getStepHistory,
    getStepHistoryForUsers,
    getStepsByDate,
    getTotalSteps,
    markGoalAchieved,
    recordSteps,
    updateSteps,
};

