import fs from 'fs/promises';
import path from 'path';
import type { ClientSession, Db } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';

const USERS_TABLE = process.env.MONGO_USERS_COLLECTION || 'users';
const STEP_HISTORY_TABLE = process.env.MONGO_STEP_HISTORY_COLLECTION || 'step_history';
const ACTIVITY_TABLE = process.env.MONGO_ACTIVITY_COLLECTION || 'user_activity';
const EXERCISE_HISTORY_TABLE = process.env.MONGO_EXERCISE_HISTORY_COLLECTION || 'exercise_history';
const FAVORITES_TABLE = process.env.MONGO_FAVORITES_COLLECTION || 'favorites';
const USER_STATS_TABLE = process.env.MONGO_USER_STATS_COLLECTION || 'user_stats';

function isTransactionUnsupportedError(error: unknown): boolean {
  const err = error as { code?: number; codeName?: string; message?: string };
  const msg = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  if (err.code === 20 && msg.includes('transaction')) return true;
  if (err.codeName === 'IllegalOperation' && msg.includes('transaction')) return true;
  if (msg.includes('replica set') && msg.includes('transaction')) return true;
  if (msg.includes('transactions are not supported')) return true;
  return false;
}

async function removeAvatarIfPresent(avatarPath: unknown): Promise<void> {
  if (typeof avatarPath !== 'string' || !avatarPath.trim()) return;
  const rel = avatarPath.trim();
  const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  try {
    await fs.unlink(abs);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      console.warn('[account-deletion] could not remove avatar file', { abs, code });
    }
  }
}

async function deleteUserOwnedDocuments(db: Db, userId: string, session?: ClientSession): Promise<void> {
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
async function deleteAccountByUserId(userId: string): Promise<void> {
  const client = getMongoClient();
  const db = client.db(getMongoDbName());
  const usersColl = db.collection(USERS_TABLE);
  const userDoc = await usersColl.findOne({ userId });
  const avatarPath = userDoc ? (userDoc as Record<string, unknown>).avatar : undefined;

  const session = client.startSession();
  try {
    try {
      await session.withTransaction(async () => {
        await deleteUserOwnedDocuments(db, userId, session);
      });
    } catch (error: unknown) {
      if (isTransactionUnsupportedError(error)) {
        console.warn('[account-deletion] transactions unavailable; using sequential deletes', {
          userId,
          message: (error as Error)?.message,
        });
        await deleteUserOwnedDocuments(db, userId);
      } else {
        throw error;
      }
    }
  } finally {
    await session.endSession();
  }

  await removeAvatarIfPresent(avatarPath);
}

export { deleteAccountByUserId };
