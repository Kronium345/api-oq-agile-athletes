import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';
import type { BodyScanUpstreamResult } from '../services/formCoachClient.ts';

const COLLECTION = process.env.MONGO_BODY_SCANS_COLLECTION || 'body_scans';

export interface BodyScanRecord {
  scanId: string;
  userId: string;
  createdAt: string;
  bodyFatPercent: number | null;
  bmi: number | null;
  measurementsCm: Record<string, number> | null;
  confidence: string | null;
  warnings: string[];
  disclaimer: string | null;
  usedSideView: boolean;
  heightCm: number;
  weightKg: number;
  age: number;
  sex: 'male' | 'female';
  /** Full Form Coach response for debugging / future fields — no photos stored. */
  raw: BodyScanUpstreamResult;
}

function getCollection(): Collection<BodyScanRecord> {
  return getMongoClient().db(getMongoDbName()).collection<BodyScanRecord>(COLLECTION);
}

let indexesEnsured = false;

export async function ensureBodyScanIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const col = getCollection();
  await col.createIndex({ userId: 1, createdAt: -1 });
  indexesEnsured = true;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asMeasurements(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
  }
  return Object.keys(out).length ? out : null;
}

export async function saveBodyScan(params: {
  userId: string;
  heightCm: number;
  weightKg: number;
  age: number;
  sex: 'male' | 'female';
  usedSideView: boolean;
  result: BodyScanUpstreamResult;
}): Promise<BodyScanRecord> {
  const warnings = Array.isArray(params.result.warnings)
    ? params.result.warnings.filter((w): w is string => typeof w === 'string')
    : [];

  const doc: BodyScanRecord = {
    scanId: uuidv4(),
    userId: params.userId,
    createdAt: new Date().toISOString(),
    bodyFatPercent: asNumber(params.result.body_fat_percent),
    bmi: asNumber(params.result.bmi),
    measurementsCm: asMeasurements(params.result.measurements_cm),
    confidence:
      typeof params.result.confidence === 'string' ? params.result.confidence : null,
    warnings,
    disclaimer:
      typeof params.result.disclaimer === 'string' ? params.result.disclaimer : null,
    usedSideView: params.usedSideView,
    heightCm: params.heightCm,
    weightKg: params.weightKg,
    age: params.age,
    sex: params.sex,
    raw: params.result,
  };

  await getCollection().insertOne(doc);
  return doc;
}

export async function listBodyScansForUser(
  userId: string,
  limit = 20
): Promise<BodyScanRecord[]> {
  return getCollection()
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(1, limit), 50))
    .toArray();
}

export async function getLatestBodyScanForUser(
  userId: string
): Promise<BodyScanRecord | null> {
  return getCollection().findOne({ userId }, { sort: { createdAt: -1 } });
}

export async function countBodyScansSince(
  userId: string,
  sinceIso: string
): Promise<number> {
  return getCollection().countDocuments({
    userId,
    createdAt: { $gte: sinceIso },
  });
}
