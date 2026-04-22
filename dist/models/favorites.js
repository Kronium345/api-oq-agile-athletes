import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';
const FAVORITES_TABLE = process.env.MONGO_FAVORITES_COLLECTION || 'favorites';
function getFavoritesCollection() {
    const client = getMongoClient();
    const db = client.db(getMongoDbName());
    return db.collection(FAVORITES_TABLE);
}
async function toggleFavorite(userId, exerciseIdentifier) {
    const timestamp = new Date().toISOString();
    const collection = getFavoritesCollection();
    try {
        const isCurrentlyFavorite = await isFavorite(userId, exerciseIdentifier);
        if (!isCurrentlyFavorite) {
            await collection.updateOne({ userId, exerciseName: exerciseIdentifier }, {
                $set: { isFavorite: true, updatedAt: timestamp },
                $setOnInsert: { createdAt: timestamp },
            }, { upsert: true });
            return { userId, exerciseName: exerciseIdentifier, isFavorite: true };
        }
        else {
            await collection.deleteOne({ userId, exerciseName: exerciseIdentifier });
            return { userId, exerciseName: exerciseIdentifier, isFavorite: false };
        }
    }
    catch (error) {
        console.error('Error in toggleFavorite:', error);
        throw error;
    }
}
async function getFavorites(userId) {
    try {
        const collection = getFavoritesCollection();
        return collection.find({ userId }).toArray();
    }
    catch (error) {
        console.error('Error getting favorites:', error);
        throw error;
    }
}
/**
 * Check if an exercise is favorited
 */
async function isFavorite(userId, exerciseName) {
    try {
        const collection = getFavoritesCollection();
        const favorite = await collection.findOne({ userId, exerciseName }, { projection: { _id: 1 } });
        return Boolean(favorite);
    }
    catch (error) {
        console.error('Error checking favorite:', error);
        return false;
    }
}
export { getFavorites, isFavorite, toggleFavorite };
