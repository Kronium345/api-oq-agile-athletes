import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';

const ACTIVITY_TABLE = process.env.MONGO_ACTIVITY_COLLECTION || 'user_activity';

interface ActivityItem {
  userId: string;
  date: string; 
  timestamp: string;
  activityType: string;
  createdAt: string;
  updatedAt: string;
}

function getActivityCollection(): Collection<ActivityItem> {
  const client = getMongoClient();
  const db = client.db(getMongoDbName());
  return db.collection<ActivityItem>(ACTIVITY_TABLE);
}

async function recordActivity(userId: string, date?: string): Promise<ActivityItem> {
  if (!userId) {
    throw new Error('userId is required');
  }

  const timestamp = new Date().toISOString();
  const activityDate = date || new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

  // Ensure date is not empty
  if (!activityDate) {
    throw new Error('date cannot be empty');
  }

  const item: ActivityItem = {
    userId,
    date: activityDate,
    timestamp,
    activityType: 'app_usage',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const collection = getActivityCollection();
  await collection.updateOne(
    { userId, date: activityDate },
    {
      $setOnInsert: item,
      $set: { updatedAt: timestamp, timestamp },
    },
    { upsert: true }
  );

  return item;
}

/**
 * Get activity data for a user within a date range
 */
async function getActivityData(userId: string, startDate: string, endDate: string): Promise<ActivityItem[]> {
  if (!userId || !startDate || !endDate) {
    console.error('getActivityData: Missing userId, startDate, or endDate');
    throw new Error('Missing required parameters for getActivityData');
  }

  const collection = getActivityCollection();
  return collection
    .find({ userId, date: { $gte: startDate, $lte: endDate } })
    .sort({ date: -1 })
    .toArray();
}

export {
  getActivityData,
  recordActivity,
  // Export types
  type ActivityItem
};

