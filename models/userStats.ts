import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../config/ddbClient.js';

const USER_STATS_TABLE = process.env.DDB_USER_STATS_TABLE || 'UserStats';

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

/**
 * Get user stats - creates default stats if user doesn't exist
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  try {
    const command = new GetCommand({
      TableName: USER_STATS_TABLE,
      Key: { userId },
    });

    const result = await ddbDocClient.send(command);

    if (result.Item) {
      return result.Item as UserStats;
    }

    // User doesn't have stats yet - create default
    const defaultStats: UserStats = {
      userId,
      totalWorkouts: 0,
      totalCalories: 0,
      totalMinutes: 0,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    // Create the record
    await ddbDocClient.send(
      new PutCommand({
        TableName: USER_STATS_TABLE,
        Item: defaultStats,
      })
    );

    return defaultStats;
  } catch (error: any) {
    console.error('Error getting user stats:', error);
    
    // If table doesn't exist, return default stats
    if (error.name === 'ResourceNotFoundException') {
      console.warn('UserStats table not found - returning default stats');
      return {
        userId,
        totalWorkouts: 0,
        totalCalories: 0,
        totalMinutes: 0,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
    }
    
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
  try {
    // First, get current stats (or create if doesn't exist)
    const currentStats = await getUserStats(userId);

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, number> = {};

    if (updates.workouts !== undefined) {
      updateExpressions.push('#workouts = #workouts + :workouts');
      expressionAttributeNames['#workouts'] = 'totalWorkouts';
      expressionAttributeValues[':workouts'] = updates.workouts;
    }

    if (updates.calories !== undefined) {
      updateExpressions.push('#calories = #calories + :calories');
      expressionAttributeNames['#calories'] = 'totalCalories';
      expressionAttributeValues[':calories'] = updates.calories;
    }

    if (updates.minutes !== undefined) {
      updateExpressions.push('#minutes = #minutes + :minutes');
      expressionAttributeNames['#minutes'] = 'totalMinutes';
      expressionAttributeValues[':minutes'] = updates.minutes;
    }

    // Always update lastUpdated
    updateExpressions.push('#lastUpdated = :lastUpdated');
    expressionAttributeNames['#lastUpdated'] = 'lastUpdated';
    expressionAttributeValues[':lastUpdated'] = Date.now();

    // If no updates, just return current stats
    if (updateExpressions.length === 1) {
      return currentStats;
    }

    const command = new UpdateCommand({
      TableName: USER_STATS_TABLE,
      Key: { userId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const result = await ddbDocClient.send(command);
    return result.Attributes as UserStats;
  } catch (error: any) {
    console.error('Error updating user stats:', error);
    
    // If table doesn't exist, return current stats without updating
    if (error.name === 'ResourceNotFoundException') {
      console.warn('UserStats table not found - stats not updated');
      return await getUserStats(userId);
    }
    
    throw error;
  }
}

/**
 * Reset user stats (optional - for testing/admin purposes)
 */
export async function resetUserStats(userId: string): Promise<UserStats> {
  const resetStats: UserStats = {
    userId,
    totalWorkouts: 0,
    totalCalories: 0,
    totalMinutes: 0,
    lastUpdated: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: USER_STATS_TABLE,
        Item: resetStats,
      })
    );

    return resetStats;
  } catch (error: any) {
    console.error('Error resetting user stats:', error);
    throw error;
  }
}

