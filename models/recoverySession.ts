import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const COLLECTION = process.env.MONGO_RECOVERY_SESSIONS_COLLECTION || 'recovery_sessions';

export type RecoverySessionStatus = 'started' | 'completed' | 'abandoned';

export type RecoverySessionContext =
  | 'mind_center'
  | 'performance_hub'
  | 'ai_coach'
  | 'notification'
  | 'other';

export interface RecoverySessionDevice {
  platform?: string;
  appVersion?: string;
}

export interface RecoverySession {
  sessionId: string;
  userId: string;
  protocolId: string;
  status: RecoverySessionStatus;
  startedAt: string;
  completedAt?: string | null;
  durationSec?: number | null;
  plannedDurationSec?: number | null;
  context?: RecoverySessionContext | string | null;
  athleteMode?: string | null;
  moodBefore?: number | null;
  moodAfter?: number | null;
  stressBefore?: number | null;
  stressAfter?: number | null;
  device?: RecoverySessionDevice | null;
  createdAt: string;
  updatedAt: string;
}

export type RecoverySessionCreateInput = Omit<
  RecoverySession,
  'sessionId' | 'createdAt' | 'updatedAt'
> & { sessionId?: string };

function getCollection(): Collection<RecoverySession> {
  return getMongoClient().db(getMongoDbName()).collection<RecoverySession>(COLLECTION);
}

let indexesEnsured = false;

export async function ensureRecoverySessionIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const col = getCollection();
  await col.createIndex({ sessionId: 1 }, { unique: true });
  await col.createIndex({ userId: 1, completedAt: -1 });
  await col.createIndex({ userId: 1, protocolId: 1, completedAt: -1 });
  await col.createIndex({ userId: 1, status: 1, completedAt: -1 });
  await col.createIndex({ userId: 1, startedAt: -1 });
  indexesEnsured = true;
}

export async function createRecoverySession(
  input: RecoverySessionCreateInput
): Promise<RecoverySession> {
  const now = new Date().toISOString();
  const doc: RecoverySession = {
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

export async function updateRecoverySession(
  userId: string,
  sessionId: string,
  patch: Partial<Omit<RecoverySession, 'sessionId' | 'userId' | 'createdAt'>>
): Promise<RecoverySession | null> {
  const now = new Date().toISOString();
  const result = await getCollection().findOneAndUpdate(
    { userId, sessionId },
    { $set: { ...patch, updatedAt: now } },
    { returnDocument: 'after' }
  );
  return result ?? null;
}

export async function getRecoverySessionById(
  userId: string,
  sessionId: string
): Promise<RecoverySession | null> {
  return getCollection().findOne({ userId, sessionId });
}

export async function listRecoverySessions(
  userId: string,
  options: {
    limit?: number;
    from?: string;
    to?: string;
    status?: RecoverySessionStatus;
  } = {}
): Promise<RecoverySession[]> {
  const filter: Record<string, unknown> = { userId };

  if (options.status) {
    filter.status = options.status;
  }

  if (options.from || options.to) {
    const range: Record<string, string> = {};
    if (options.from) range.$gte = options.from;
    if (options.to) range.$lte = options.to;
    filter.startedAt = range;
  }

  const limit = Math.min(Math.max(1, options.limit ?? 20), 100);

  return getCollection()
    .find(filter)
    .sort({ startedAt: -1 })
    .limit(limit)
    .toArray();
}

export async function countCompletedSessionsInRange(
  userId: string,
  fromIso: string,
  toIso: string
): Promise<number> {
  return getCollection().countDocuments({
    userId,
    status: 'completed',
    completedAt: { $gte: fromIso, $lte: toIso },
  });
}

export async function listCompletedSessionsInRange(
  userId: string,
  fromIso: string,
  toIso: string
): Promise<RecoverySession[]> {
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
export async function countCompletedSessionsOnDate(
  userId: string,
  dateYyyyMmDd: string
): Promise<number> {
  const fromIso = `${dateYyyyMmDd}T00:00:00.000Z`;
  const toIso = `${dateYyyyMmDd}T23:59:59.999Z`;
  return countCompletedSessionsInRange(userId, fromIso, toIso);
}
