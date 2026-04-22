import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';

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

function getFavoritesCollection(): Collection<FavoriteItem> {
  const client = getMongoClient();
  const db = client.db(getMongoDbName());
  return db.collection<FavoriteItem>(FAVORITES_TABLE);
}

async function toggleFavorite(userId: string, exerciseIdentifier: string): Promise<FavoriteResult> {
  const timestamp = new Date().toISOString();
  const collection = getFavoritesCollection();

  try {
    const isCurrentlyFavorite = await isFavorite(userId, exerciseIdentifier);

    if (!isCurrentlyFavorite) {
      await collection.updateOne(
        { userId, exerciseName: exerciseIdentifier },
        {
          $set: { isFavorite: true, updatedAt: timestamp },
          $setOnInsert: { createdAt: timestamp },
        },
        { upsert: true }
      );
      return { userId, exerciseName: exerciseIdentifier, isFavorite: true };
    } else {
      await collection.deleteOne({ userId, exerciseName: exerciseIdentifier });
      return { userId, exerciseName: exerciseIdentifier, isFavorite: false };
    }
  } catch (error: any) {
    console.error('Error in toggleFavorite:', error);
    throw error;
  }
}

async function getFavorites(userId: string): Promise<FavoriteItem[]> {
  try {
    const collection = getFavoritesCollection();
    return collection.find({ userId }).toArray();
  } catch (error: any) {
    console.error('Error getting favorites:', error);
    throw error;
  }
}

/**
 * Check if an exercise is favorited
 */
async function isFavorite(userId: string, exerciseName: string): Promise<boolean> {
  try {
    const collection = getFavoritesCollection();
    const favorite = await collection.findOne({ userId, exerciseName }, { projection: { _id: 1 } });
    return Boolean(favorite);
  } catch (error: any) {
    console.error('Error checking favorite:', error);
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

