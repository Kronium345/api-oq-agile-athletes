import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';

const USER_STATS_TABLE = process.env.MONGO_USER_STATS_COLLECTION || 'user_stats';

export interface UserStats {
  userId: string;
  totalWorkouts: number;
  totalCalories: number;
  totalMinutes: number;
  lastUpdated: string;
  createdAt: string;
}

interface UpdateStatsParams {
  workouts?: number;
  calories?: number;
  minutes?: number;
}

function getUserStatsCollection(): Collection<UserStats> {
  const client = getMongoClient();
  const db = client.db(getMongoDbName());
  return db.collection<UserStats>(USER_STATS_TABLE);
}

function buildDefaultStats(userId: string): UserStats {
  const now = new Date().toISOString();
  return {
    userId,
    totalWorkouts: 0,
    totalCalories: 0,
    totalMinutes: 0,
    lastUpdated: now,
    createdAt: now,
  };
}

/**
 * Get user stats - creates default stats if user doesn't exist
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  const collection = getUserStatsCollection();
  try {
    const existing = await collection.findOne({ userId });
    if (existing) {
      return existing;
    }

    const defaultStats = buildDefaultStats(userId);
    await collection.insertOne(defaultStats);

    return defaultStats;
  } catch (error: any) {
    console.error('[user-stats] DB error in getUserStats', {
      userId,
      message: error?.message,
    });
    throw error;
  }
}

/**
 * Update user stats - increments values
 */
export async function updateUserStats(
  userId: string,
  updates: UpdateStatsParams
): Promise<UserStats> {
  const collection = getUserStatsCollection();
  try {
    const now = new Date().toISOString();
    const updateResult = await collection.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: buildDefaultStats(userId),
        $set: { lastUpdated: now },
        $inc: {
          totalWorkouts: updates.workouts ?? 0,
          totalCalories: updates.calories ?? 0,
          totalMinutes: updates.minutes ?? 0,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
      }
    );

    if (!updateResult) {
      throw new Error('Failed to update stats document');
    }

    const updated = await collection.findOne({ userId });
    if (!updated) {
      throw new Error('Stats document missing after update');
    }
    return updated;
  } catch (error: any) {
    console.error('[user-stats] DB error in updateUserStats', {
      userId,
      updates,
      message: error?.message,
    });
    throw error;
  }
}

/**
 * Reset user stats (optional - for testing/admin purposes)
 */
export async function resetUserStats(userId: string): Promise<UserStats> {
  const collection = getUserStatsCollection();
  const resetStats = buildDefaultStats(userId);

  try {
    await collection.replaceOne({ userId }, resetStats, { upsert: true });
    return resetStats;
  } catch (error: any) {
    console.error('[user-stats] DB error in resetUserStats', {
      userId,
      message: error?.message,
    });
    throw error;
  }
}

