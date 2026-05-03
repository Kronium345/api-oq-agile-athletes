import fs from 'fs/promises';
import path from 'path';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';
const USERS_TABLE = process.env.MONGO_USERS_COLLECTION || 'users';
const STEP_HISTORY_TABLE = process.env.MONGO_STEP_HISTORY_COLLECTION || 'step_history';
const ACTIVITY_TABLE = process.env.MONGO_ACTIVITY_COLLECTION || 'user_activity';
const EXERCISE_HISTORY_TABLE = process.env.MONGO_EXERCISE_HISTORY_COLLECTION || 'exercise_history';
const FAVORITES_TABLE = process.env.MONGO_FAVORITES_COLLECTION || 'favorites';
const USER_STATS_TABLE = process.env.MONGO_USER_STATS_COLLECTION || 'user_stats';
function isTransactionUnsupportedError(error) {
    const err = error;
    const msg = typeof err.message === 'string' ? err.message.toLowerCase() : '';
    if (err.code === 20 && msg.includes('transaction'))
        return true;
    if (err.codeName === 'IllegalOperation' && msg.includes('transaction'))
        return true;
    if (msg.includes('replica set') && msg.includes('transaction'))
        return true;
    if (msg.includes('transactions are not supported'))
        return true;
    return false;
}
async function removeAvatarIfPresent(avatarPath) {
    if (typeof avatarPath !== 'string' || !avatarPath.trim())
        return;
    const rel = avatarPath.trim();
    const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
    try {
        await fs.unlink(abs);
    }
    catch (e) {
        const code = e?.code;
        if (code !== 'ENOENT') {
            console.warn('[account-deletion] could not remove avatar file', { abs, code });
        }
    }
}
async function deleteUserOwnedDocuments(db, userId, session) {
    const opts = session ? { session } : {};
    await db.collection(STEP_HISTORY_TABLE).deleteMany({ userId }, opts);
    await db.collection(ACTIVITY_TABLE).deleteMany({ userId }, opts);
    await db.collection(EXERCISE_HISTORY_TABLE).deleteMany({ userId }, opts);
    await db.collection(FAVORITES_TABLE).deleteMany({ userId }, opts);
    await db.collection(USER_STATS_TABLE).deleteMany({ userId }, opts);
    await db.collection(USERS_TABLE).deleteOne({ userId }, opts);
}
/**
 * Permanently removes the user row and all app data keyed by userId.
 * Sessions are stateless (Bearer resolves to DB user); deleting the user invalidates the token.
 * Uses a multi-document transaction when the deployment supports it; otherwise falls back to sequential deletes.
 */
async function deleteAccountByUserId(userId) {
    const client = getMongoClient();
    const db = client.db(getMongoDbName());
    const usersColl = db.collection(USERS_TABLE);
    const userDoc = await usersColl.findOne({ userId });
    const avatarPath = userDoc ? userDoc.avatar : undefined;
    const session = client.startSession();
    try {
        try {
            await session.withTransaction(async () => {
                await deleteUserOwnedDocuments(db, userId, session);
            });
        }
        catch (error) {
            if (isTransactionUnsupportedError(error)) {
                console.warn('[account-deletion] transactions unavailable; using sequential deletes', {
                    userId,
                    message: error?.message,
                });
                await deleteUserOwnedDocuments(db, userId);
            }
            else {
                throw error;
            }
        }
    }
    finally {
        await session.endSession();
    }
    await removeAvatarIfPresent(avatarPath);
}
export { deleteAccountByUserId };
