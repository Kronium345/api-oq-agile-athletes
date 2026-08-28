import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const COLLECTION = process.env.MONGO_TRAINER_VIDEOS_COLLECTION || 'trainer_videos';

export interface TrainerVideo {
  videoId: string;
  trainerId: string;
  userId: string;
  title: string;
  description?: string | null;
  storageKey: string;
  thumbnailKey?: string | null;
  durationSec?: number | null;
  mimeType: string;
  assignedMemberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type TrainerVideoCreateInput = {
  videoId?: string;
  trainerId: string;
  userId: string;
  title: string;
  description?: string | null;
  storageKey: string;
  thumbnailKey?: string | null;
  durationSec?: number | null;
  mimeType: string;
  assignedMemberIds?: string[];
};

export type TrainerVideoUpdateInput = {
  title?: string;
  description?: string | null;
  assignedMemberIds?: string[];
  durationSec?: number | null;
  thumbnailKey?: string | null;
};

function getCollection(): Collection<TrainerVideo> {
  return getMongoClient().db(getMongoDbName()).collection<TrainerVideo>(COLLECTION);
}

let indexesEnsured = false;

export async function ensureTrainerVideoIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const col = getCollection();
  await col.createIndex({ videoId: 1 }, { unique: true });
  await col.createIndex({ trainerId: 1, createdAt: -1 });
  await col.createIndex({ assignedMemberIds: 1, createdAt: -1 });
  indexesEnsured = true;
}

export async function createTrainerVideo(input: TrainerVideoCreateInput): Promise<TrainerVideo> {
  const now = new Date().toISOString();
  const doc: TrainerVideo = {
    videoId: input.videoId || uuidv4(),
    trainerId: input.trainerId,
    userId: input.userId,
    title: input.title,
    description: input.description ?? null,
    storageKey: input.storageKey,
    thumbnailKey: input.thumbnailKey ?? null,
    durationSec: input.durationSec ?? null,
    mimeType: input.mimeType,
    assignedMemberIds: input.assignedMemberIds ?? [],
    createdAt: now,
    updatedAt: now,
  };

  await getCollection().insertOne(doc);
  return doc;
}

export async function getTrainerVideoById(videoId: string): Promise<TrainerVideo | null> {
  return getCollection().findOne({ videoId });
}

export async function getTrainerVideoForTrainer(
  trainerId: string,
  videoId: string
): Promise<TrainerVideo | null> {
  return getCollection().findOne({ trainerId, videoId });
}

export async function listTrainerVideosForTrainer(trainerId: string): Promise<TrainerVideo[]> {
  return getCollection().find({ trainerId }).sort({ createdAt: -1 }).toArray();
}

export async function listAssignedVideosForMember(memberId: string): Promise<TrainerVideo[]> {
  return getCollection()
    .find({ assignedMemberIds: memberId })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function listAssignedVideosForMemberFromTrainer(
  trainerId: string,
  memberId: string
): Promise<TrainerVideo[]> {
  return getCollection()
    .find({ trainerId, assignedMemberIds: memberId })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function updateTrainerVideo(
  trainerId: string,
  videoId: string,
  patch: TrainerVideoUpdateInput
): Promise<TrainerVideo | null> {
  const now = new Date().toISOString();
  const result = await getCollection().findOneAndUpdate(
    { trainerId, videoId },
    { $set: { ...patch, updatedAt: now } },
    { returnDocument: 'after' }
  );
  return result ?? null;
}

export async function deleteTrainerVideo(
  trainerId: string,
  videoId: string
): Promise<TrainerVideo | null> {
  const result = await getCollection().findOneAndDelete({ trainerId, videoId });
  return result ?? null;
}
