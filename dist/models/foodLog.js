import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
import { endOfDay, parseYyyyMmDd, startOfDay } from "../utils/dateRanges.js";
const FOOD_LOG_TABLE = process.env.MONGO_FOOD_LOG_COLLECTION || 'food_logs';
function getFoodLogCollection() {
    const client = getMongoClient();
    return client.db(getMongoDbName()).collection(FOOD_LOG_TABLE);
}
function serializeLog(doc) {
    return {
        ...doc,
        _id: doc._id != null ? String(doc._id) : undefined,
        loggedAt: doc.loggedAt instanceof Date ? doc.loggedAt.toISOString() : doc.loggedAt,
    };
}
async function createFoodLog(entry) {
    const collection = getFoodLogCollection();
    const doc = { ...entry, loggedAt: new Date() };
    await collection.insertOne(doc);
    return doc;
}
async function getFoodLogsByUserId(userId, dateStr) {
    const filter = { userId };
    if (dateStr) {
        const day = parseYyyyMmDd(dateStr);
        if (day) {
            filter.loggedAt = { $gte: startOfDay(day), $lte: endOfDay(day) };
        }
    }
    return getFoodLogCollection().find(filter).sort({ loggedAt: -1 }).toArray();
}
async function deleteFoodLogsByUserId(userId) {
    const result = await getFoodLogCollection().deleteMany({ userId });
    return result.deletedCount;
}
export { createFoodLog, deleteFoodLogsByUserId, getFoodLogsByUserId, serializeLog, };
