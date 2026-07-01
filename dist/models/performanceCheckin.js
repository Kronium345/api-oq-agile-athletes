import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_PERFORMANCE_CHECKINS_COLLECTION || 'performance_checkins';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
let indexesEnsured = false;
export async function ensurePerformanceCheckinIndexes() {
    if (indexesEnsured)
        return;
    const col = getCollection();
    await col.createIndex({ userId: 1, date: 1 }, { unique: true });
    await col.createIndex({ userId: 1, date: -1 });
    indexesEnsured = true;
}
export async function upsertPerformanceCheckin(doc) {
    const now = new Date().toISOString();
    const existing = await getCollection().findOne({ userId: doc.userId, date: doc.date });
    const payload = {
        ...doc,
        createdAt: existing?.createdAt ?? doc.createdAt ?? now,
        updatedAt: now,
    };
    await getCollection().updateOne({ userId: doc.userId, date: doc.date }, { $set: payload }, { upsert: true });
    return (await getCollection().findOne({ userId: doc.userId, date: doc.date }));
}
export async function getPerformanceCheckinByDate(userId, date) {
    return getCollection().findOne({ userId, date });
}
export async function listPerformanceCheckins(userId, options) {
    const filter = { userId };
    if (options.startDate && options.endDate) {
        filter.date = { $gte: options.startDate, $lte: options.endDate };
    }
    const limit = Math.min(options.limit ?? 7, 90);
    return getCollection().find(filter).sort({ date: -1 }).limit(limit).toArray();
}
export async function listPerformanceCheckinsInRange(userId, startDate, endDate) {
    return getCollection()
        .find({ userId, date: { $gte: startDate, $lte: endDate } })
        .sort({ date: 1 })
        .toArray();
}
