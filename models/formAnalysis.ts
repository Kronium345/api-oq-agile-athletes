import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const COLLECTION = process.env.MONGO_FORM_ANALYSES_COLLECTION || 'form_analyses';

export interface FormAnalysisIssue {
  issue: string;
  severity: string;
  feedback: string;
}

export interface FormAnalysisRecord {
  analysisId: string;
  userId: string;
  exercise: string;
  score: number;
  issues: FormAnalysisIssue[];
  jointAngles: Record<string, number>;
  videoUrl?: string;
  createdAt: string;
}

function getCollection(): Collection<FormAnalysisRecord> {
  return getMongoClient().db(getMongoDbName()).collection<FormAnalysisRecord>(COLLECTION);
}

let indexesEnsured = false;

export async function ensureFormAnalysisIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const col = getCollection();
  await col.createIndex({ userId: 1, createdAt: -1 });
  indexesEnsured = true;
}

export async function saveFormAnalysis(params: {
  userId: string;
  result: {
    exercise: string;
    score: number;
    issues: FormAnalysisIssue[];
    joint_angles: Record<string, number>;
  };
  videoUrl?: string;
}): Promise<FormAnalysisRecord> {
  const doc: FormAnalysisRecord = {
    analysisId: uuidv4(),
    userId: params.userId,
    exercise: params.result.exercise,
    score: params.result.score,
    issues: params.result.issues || [],
    jointAngles: params.result.joint_angles || {},
    videoUrl: params.videoUrl,
    createdAt: new Date().toISOString(),
  };
  await getCollection().insertOne(doc);
  return doc;
}

export async function listFormAnalysesForUser(
  userId: string,
  limit = 20
): Promise<FormAnalysisRecord[]> {
  return getCollection()
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 50))
    .toArray();
}

export async function countFormAnalysesSince(userId: string, sinceIso: string): Promise<number> {
  return getCollection().countDocuments({
    userId,
    createdAt: { $gte: sinceIso },
  });
}
