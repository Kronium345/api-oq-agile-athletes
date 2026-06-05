import { Collection, type Filter } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';
import type { GeoPoint } from '../utils/geocode.ts';

const COLLECTION = process.env.MONGO_TRAINER_PROFILES_COLLECTION || 'trainer_profiles';

export type PriceUnit = 'session' | 'hour' | 'month';

export interface TrainerProfile {
  trainerId: string;
  userId: string;
  displayName: string;
  bio: string;
  qualifications: string[];
  specialties: string[];
  gymName: string;
  postcode: string;
  location?: GeoPoint;
  priceFrom?: number;
  priceUnit: PriceUnit;
  instagram?: string;
  availabilityNotes?: string;
  verified: boolean;
  featured: boolean;
  published: boolean;
  stripeConnectAccountId?: string;
  stripeConnectOnboarded: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  ratingAvg?: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTrainerProfileParams {
  userId: string;
  displayName: string;
  bio: string;
  qualifications?: string[];
  specialties?: string[];
  gymName: string;
  postcode: string;
  location?: GeoPoint;
  priceFrom?: number;
  priceUnit?: PriceUnit;
  instagram?: string;
  availabilityNotes?: string;
  published?: boolean;
}

export interface ListTrainersQuery {
  specialty?: string;
  q?: string;
  gymName?: string;
  postcode?: string;
  radiusKm?: number;
  nearLat?: number;
  nearLng?: number;
  limit?: number;
}

function getCollection(): Collection<TrainerProfile> {
  return getMongoClient()
    .db(getMongoDbName())
    .collection<TrainerProfile>(COLLECTION);
}

let indexesEnsured = false;

export async function ensureTrainerProfileIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const col = getCollection();
  await col.createIndex({ userId: 1 }, { unique: true });
  await col.createIndex({ location: '2dsphere' });
  await col.createIndex(
    { displayName: 'text', gymName: 'text', specialties: 'text' },
    { name: 'trainer_text_search' }
  );
  await col.createIndex({ published: 1, featured: -1, ratingAvg: -1, createdAt: -1 });
  indexesEnsured = true;
}

export async function getTrainerProfileByUserId(userId: string): Promise<TrainerProfile | null> {
  return getCollection().findOne({ userId });
}

export async function getTrainerProfileById(trainerId: string): Promise<TrainerProfile | null> {
  return getCollection().findOne({ trainerId });
}

export async function createTrainerProfile(
  params: CreateTrainerProfileParams
): Promise<TrainerProfile> {
  const now = new Date().toISOString();
  const doc: TrainerProfile = {
    trainerId: uuidv4(),
    userId: params.userId,
    displayName: params.displayName.trim(),
    bio: params.bio.trim(),
    qualifications: params.qualifications || [],
    specialties: params.specialties || [],
    gymName: params.gymName.trim(),
    postcode: params.postcode.trim().toUpperCase(),
    location: params.location,
    priceFrom: params.priceFrom,
    priceUnit: params.priceUnit || 'session',
    instagram: params.instagram?.trim(),
    availabilityNotes: params.availabilityNotes?.trim(),
    verified: false,
    featured: false,
    published: params.published ?? false,
    stripeConnectOnboarded: false,
    reviewCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await getCollection().insertOne(doc);
  return doc;
}

export async function updateTrainerProfile(
  userId: string,
  updates: Partial<Omit<TrainerProfile, 'trainerId' | 'userId' | 'createdAt'>>
): Promise<TrainerProfile | null> {
  const updateDoc = { ...updates, updatedAt: new Date().toISOString() };
  await getCollection().updateOne({ userId }, { $set: updateDoc });
  return getTrainerProfileByUserId(userId);
}

export async function updateTrainerProfileById(
  trainerId: string,
  updates: Partial<Omit<TrainerProfile, 'trainerId' | 'userId' | 'createdAt'>>
): Promise<TrainerProfile | null> {
  const updateDoc = { ...updates, updatedAt: new Date().toISOString() };
  await getCollection().updateOne({ trainerId }, { $set: updateDoc });
  return getTrainerProfileById(trainerId);
}

export async function listPublishedTrainers(
  query: ListTrainersQuery
): Promise<Array<TrainerProfile & { distanceKm?: number }>> {
  const col = getCollection();
  const limit = Math.min(query.limit || 20, 50);
  const filter: Filter<TrainerProfile> = { published: true };

  if (query.gymName) {
    filter.gymName = { $regex: query.gymName.trim(), $options: 'i' };
  }

  if (query.specialty) {
    filter.specialties = { $in: [query.specialty.trim()] };
  }

  if (query.q) {
    filter.$text = { $search: query.q.trim() };
  }

  const useGeo =
    query.nearLat != null &&
    query.nearLng != null &&
    query.radiusKm != null &&
    query.radiusKm > 0;

  if (useGeo) {
    const radiusMeters = query.radiusKm! * 1000;
    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [query.nearLng!, query.nearLat!] },
          distanceField: 'distanceMeters',
          maxDistance: radiusMeters,
          spherical: true,
          query: filter,
        },
      },
      { $limit: limit },
      {
        $addFields: {
          distanceKm: { $divide: ['$distanceMeters', 1000] },
        },
      },
    ];
    const results = await col.aggregate(pipeline).toArray();
    return results.map((r) => {
      const { distanceMeters: _, ...rest } = r as TrainerProfile & {
        distanceMeters: number;
        distanceKm: number;
      };
      return rest as TrainerProfile & { distanceKm: number };
    });
  }

  if (query.q) {
    return col
      .find(filter, { projection: { score: { $meta: 'textScore' } } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .toArray();
  }

  return col.find(filter).sort({ featured: -1, ratingAvg: -1, createdAt: -1 }).limit(limit).toArray();
}

export async function getTrainersByIds(trainerIds: string[]): Promise<TrainerProfile[]> {
  if (!trainerIds.length) return [];
  return getCollection()
    .find({ trainerId: { $in: trainerIds }, published: true })
    .toArray();
}

export async function recomputeTrainerRating(trainerId: string): Promise<void> {
  const { getReviewsForTrainer } = await import('./trainerReview.ts');
  const reviews = await getReviewsForTrainer(trainerId, 1000);
  const reviewCount = reviews.length;
  const ratingAvg =
    reviewCount > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviewCount) * 10) / 10
      : undefined;
  await getCollection().updateOne(
    { trainerId },
    { $set: { reviewCount, ratingAvg, updatedAt: new Date().toISOString() } }
  );
}
