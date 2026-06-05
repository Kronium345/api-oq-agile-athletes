import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const COLLECTION = process.env.MONGO_TRAINER_REVIEWS_COLLECTION || 'trainer_reviews';

export interface TrainerReview {
  reviewId: string;
  trainerId: string;
  memberId: string;
  displayName: string;
  rating: number;
  text: string;
  createdAt: string;
}

function getCollection(): Collection<TrainerReview> {
  return getMongoClient().db(getMongoDbName()).collection<TrainerReview>(COLLECTION);
}

let indexesEnsured = false;

export async function ensureTrainerReviewIndexes(): Promise<void> {
  if (indexesEnsured) return;
  await getCollection().createIndex({ trainerId: 1, memberId: 1 }, { unique: true });
  await getCollection().createIndex({ trainerId: 1, createdAt: -1 });
  indexesEnsured = true;
}

export async function getReviewsForTrainer(
  trainerId: string,
  limit = 50
): Promise<TrainerReview[]> {
  return getCollection()
    .find({ trainerId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function getReviewByMember(
  trainerId: string,
  memberId: string
): Promise<TrainerReview | null> {
  return getCollection().findOne({ trainerId, memberId });
}

export async function createTrainerReview(params: {
  trainerId: string;
  memberId: string;
  displayName: string;
  rating: number;
  text: string;
}): Promise<TrainerReview> {
  const doc: TrainerReview = {
    reviewId: uuidv4(),
    trainerId: params.trainerId,
    memberId: params.memberId,
    displayName: params.displayName.trim(),
    rating: params.rating,
    text: params.text.trim(),
    createdAt: new Date().toISOString(),
  };
  await getCollection().insertOne(doc);
  return doc;
}
