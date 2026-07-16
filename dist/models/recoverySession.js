import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_RECOVERY_SESSIONS_COLLECTION || 'recovery_sessions';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
let indexesEnsured = false;
export async function ensureRecoverySessionIndexes() {
    if (indexesEnsured)
        return;
    const col = getCollection();
    await col.createIndex({ sessionId: 1 }, { unique: true });
    await col.createIndex({ userId: 1, completedAt: -1 });
    await col.createIndex({ userId: 1, protocolId: 1, completedAt: -1 });
    await col.createIndex({ userId: 1, status: 1, completedAt: -1 });
    await col.createIndex({ userId: 1, startedAt: -1 });
    indexesEnsured = true;
}
export async function createRecoverySession(input) {
    const now = new Date().toISOString();
    const doc = {
        sessionId: input.sessionId || uuidv4(),
        userId: input.userId,
        protocolId: input.protocolId,
        status: input.status,
        startedAt: input.startedAt,
        completedAt: input.completedAt ?? null,
        durationSec: input.durationSec ?? null,
        plannedDurationSec: input.plannedDurationSec ?? null,
        context: input.context ?? null,
        athleteMode: input.athleteMode ?? null,
        moodBefore: input.moodBefore ?? null,
        moodAfter: input.moodAfter ?? null,
        stressBefore: input.stressBefore ?? null,
        stressAfter: input.stressAfter ?? null,
        device: input.device ?? null,
        createdAt: now,
        updatedAt: now,
    };
    await getCollection().insertOne(doc);
    return doc;
}
export async function updateRecoverySession(userId, sessionId, patch) {
    const now = new Date().toISOString();
    const result = await getCollection().findOneAndUpdate({ userId, sessionId }, { $set: { ...patch, updatedAt: now } }, { returnDocument: 'after' });
    return result ?? null;
}
export async function getRecoverySessionById(userId, sessionId) {
    return getCollection().findOne({ userId, sessionId });
}
export async function listRecoverySessions(userId, options = {}) {
    const filter = { userId };
    if (options.status) {
        filter.status = options.status;
    }
    if (options.from || options.to) {
        const range = {};
        if (options.from)
            range.$gte = options.from;
        if (options.to)
            range.$lte = options.to;
        filter.startedAt = range;
    }
    const limit = Math.min(Math.max(1, options.limit ?? 20), 100);
    return getCollection()
        .find(filter)
        .sort({ startedAt: -1 })
        .limit(limit)
        .toArray();
}
export async function countCompletedSessionsInRange(userId, fromIso, toIso) {
    return getCollection().countDocuments({
        userId,
        status: 'completed',
        completedAt: { $gte: fromIso, $lte: toIso },
    });
}
export async function listCompletedSessionsInRange(userId, fromIso, toIso) {
    return getCollection()
        .find({
        userId,
        status: 'completed',
        completedAt: { $gte: fromIso, $lte: toIso },
    })
        .sort({ completedAt: -1 })
        .toArray();
}
/** Count completed sessions whose completedAt falls on a UTC calendar day. */
export async function countCompletedSessionsOnDate(userId, dateYyyyMmDd) {
    const fromIso = `${dateYyyyMmDd}T00:00:00.000Z`;
    const toIso = `${dateYyyyMmDd}T23:59:59.999Z`;
    return countCompletedSessionsInRange(userId, fromIso, toIso);
}
