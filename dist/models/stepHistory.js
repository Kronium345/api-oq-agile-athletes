import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';
const STEP_HISTORY_TABLE = process.env.MONGO_STEP_HISTORY_COLLECTION || 'step_history';
function getStepHistoryCollection() {
    const client = getMongoClient();
    const db = client.db(getMongoDbName());
    return db.collection(STEP_HISTORY_TABLE);
}
async function recordSteps(userId, date, stepCount) {
    const collection = getStepHistoryCollection();
    const now = new Date().toISOString();
    const item = {
        userId,
        date,
        stepCount: Number(stepCount),
        createdAt: now,
        updatedAt: now,
    };
    await collection.updateOne({ userId, date }, { $set: { stepCount: item.stepCount, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
    return {
        ...item,
        createdAt: (await getStepsByDate(userId, date))?.createdAt || now,
    };
}
async function getStepHistory(userId, startDate, endDate) {
    const collection = getStepHistoryCollection();
    return collection
        .find({ userId, date: { $gte: startDate, $lte: endDate } })
        .sort({ date: -1 })
        .toArray();
}
/**
 * Get step count for a specific date
 */
async function getStepsByDate(userId, date) {
    const collection = getStepHistoryCollection();
    return collection.findOne({ userId, date });
}
/**
 * Get total steps for a user (all time or within date range)
 */
async function getTotalSteps(userId, startDate = null, endDate = null) {
    let items;
    if (startDate && endDate) {
        items = await getStepHistory(userId, startDate, endDate);
    }
    else {
        const collection = getStepHistoryCollection();
        items = await collection.find({ userId }).toArray();
    }
    return items.reduce((total, item) => total + (item.stepCount || 0), 0);
}
/**
 * Update step count for a specific date
 */
async function updateSteps(userId, date, stepCount) {
    const collection = getStepHistoryCollection();
    await collection.updateOne({ userId, date }, {
        $set: { stepCount: Number(stepCount), updatedAt: new Date().toISOString() },
        $setOnInsert: { createdAt: new Date().toISOString() },
    }, { upsert: true });
    return getStepsByDate(userId, date);
}
export { getStepHistory, getStepsByDate, getTotalSteps, recordSteps, updateSteps };
