import { Collection } from 'mongodb';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';
import type { PerformanceRecommendation, TrainingLoadBand } from '../services/performanceScoring.ts';

const COLLECTION =
  process.env.MONGO_PERFORMANCE_CHECKINS_COLLECTION || 'performance_checkins';

export interface PerformanceCheckin {
  userId: string;
  date: string;
  sleepHours: number;
  sleepQuality: number;
  stress: number;
  energy: number;
  muscleSoreness: number;
  proteinIntake?: number;
  waterIntakeLiters?: number;
  alcohol?: boolean;
  recoveryScore: number;
  sleepScore: number;
  stressScore: number;
  energyScore: number;
  trainingLoad: TrainingLoadBand;
  recommendations: PerformanceRecommendation[];
  createdAt: string;
  updatedAt: string;
}

function getCollection(): Collection<PerformanceCheckin> {
  return getMongoClient().db(getMongoDbName()).collection<PerformanceCheckin>(COLLECTION);
}

let indexesEnsured = false;

export async function ensurePerformanceCheckinIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const col = getCollection();
  await col.createIndex({ userId: 1, date: 1 }, { unique: true });
  await col.createIndex({ userId: 1, date: -1 });
  indexesEnsured = true;
}

export async function upsertPerformanceCheckin(
  doc: Omit<PerformanceCheckin, 'createdAt' | 'updatedAt'> & { createdAt?: string }
): Promise<PerformanceCheckin> {
  const now = new Date().toISOString();
  const existing = await getCollection().findOne({ userId: doc.userId, date: doc.date });

  const payload: PerformanceCheckin = {
    ...doc,
    createdAt: existing?.createdAt ?? doc.createdAt ?? now,
    updatedAt: now,
  };

  await getCollection().updateOne(
    { userId: doc.userId, date: doc.date },
    { $set: payload },
    { upsert: true }
  );

  return (await getCollection().findOne({ userId: doc.userId, date: doc.date }))!;
}

export async function getPerformanceCheckinByDate(
  userId: string,
  date: string
): Promise<PerformanceCheckin | null> {
  return getCollection().findOne({ userId, date });
}

export async function listPerformanceCheckins(
  userId: string,
  options: { limit?: number; startDate?: string; endDate?: string }
): Promise<PerformanceCheckin[]> {
  const filter: Record<string, unknown> = { userId };

  if (options.startDate && options.endDate) {
    filter.date = { $gte: options.startDate, $lte: options.endDate };
  }

  const limit = Math.min(options.limit ?? 7, 90);

  return getCollection().find(filter).sort({ date: -1 }).limit(limit).toArray();
}

export async function listPerformanceCheckinsInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<PerformanceCheckin[]> {
  return getCollection()
    .find({ userId, date: { $gte: startDate, $lte: endDate } })
    .sort({ date: 1 })
    .toArray();
}
