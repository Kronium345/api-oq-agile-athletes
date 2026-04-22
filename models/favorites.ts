import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../config/ddbClient.js';

const FAVORITES_TABLE = process.env.MONGO_FAVORITES_COLLECTION || 'favorites';

interface FavoriteItem {
  userId: string;
  exerciseName: string;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface FavoriteResult {
  userId: string;
  exerciseName: string;
  isFavorite: boolean;
}

async function toggleFavorite(userId: string, exerciseIdentifier: string): Promise<FavoriteResult> {
  const timestamp = new Date().toISOString();

  try {
    const isCurrentlyFavorite = await isFavorite(userId, exerciseIdentifier);

    if (!isCurrentlyFavorite) {
      // Add to favorites
      await ddbDocClient.send(
        new PutCommand({
          TableName: FAVORITES_TABLE,
          Item: {
            userId,
            exerciseName: exerciseIdentifier,
            isFavorite: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        })
      );
      return { userId, exerciseName: exerciseIdentifier, isFavorite: true };
    } else {
      // Remove from favorites
      await ddbDocClient.send(
        new DeleteCommand({
          TableName: FAVORITES_TABLE,
          Key: {
            userId,
            exerciseName: exerciseIdentifier,
          },
        })
      );
      return { userId, exerciseName: exerciseIdentifier, isFavorite: false };
    }
  } catch (error: any) {
    console.error('Error in toggleFavorite:', error);
    
    if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
      console.warn(`Favorites table '${FAVORITES_TABLE}' does not exist. Simulating toggle for user experience.`);
      return { userId, exerciseName: exerciseIdentifier, isFavorite: true };
    }
    
    throw error;
  }
}

async function getFavorites(userId: string): Promise<FavoriteItem[]> {
  try {
    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: FAVORITES_TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      })
    );

    return (result.Items || []) as FavoriteItem[];
  } catch (error: any) {
    console.error('Error getting favorites:', error);
    
    if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
      console.warn(`Favorites table '${FAVORITES_TABLE}' does not exist. Returning empty favorites list.`);
      return [];
    }
    
    throw error;
  }
}

/**
 * Check if an exercise is favorited
 */
async function isFavorite(userId: string, exerciseName: string): Promise<boolean> {
  try {
    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: FAVORITES_TABLE,
        KeyConditionExpression: 'userId = :userId AND exerciseName = :exerciseName',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':exerciseName': exerciseName,
        },
        Limit: 1,
      })
    );

    return result.Items !== undefined && result.Items.length > 0;
  } catch (error: any) {
    console.error('Error checking favorite:', error);
    
    if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
      console.warn(`Favorites table '${FAVORITES_TABLE}' does not exist. Returning false for isFavorite check.`);
      return false;
    }
    
    return false;
  }
}

export {
    getFavorites,
    isFavorite,
    toggleFavorite,
    // Export types
    type FavoriteItem,
    type FavoriteResult
};

