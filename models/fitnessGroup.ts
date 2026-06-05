import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';
import type { GeoPoint } from '../utils/geocode.ts';

const COLLECTION = process.env.MONGO_FITNESS_GROUPS_COLLECTION || 'fitness_groups';

export interface FitnessGroup {
  groupId: string;
  name: string;
  description: string;
  gymName?: string;
  postcode?: string;
  location?: GeoPoint;
  scheduleSummary?: string;
  memberCount: number;
  createdBy?: string;
  createdAt: string;
}

function getCollection(): Collection<FitnessGroup> {
  return getMongoClient().db(getMongoDbName()).collection<FitnessGroup>(COLLECTION);
}

let indexesEnsured = false;

export async function ensureFitnessGroupIndexes(): Promise<void> {
  if (indexesEnsured) return;
  await getCollection().createIndex({ location: '2dsphere' });
  indexesEnsured = true;
}

export async function listFitnessGroups(query: {
  nearLat?: number;
  nearLng?: number;
  radiusKm?: number;
  limit?: number;
}): Promise<FitnessGroup[]> {
  const col = getCollection();
  const limit = Math.min(query.limit || 20, 50);

  if (
    query.nearLat != null &&
    query.nearLng != null &&
    query.radiusKm != null &&
    query.radiusKm > 0
  ) {
    const results = await col
      .aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [query.nearLng, query.nearLat] },
            distanceField: 'distanceMeters',
            maxDistance: query.radiusKm * 1000,
            spherical: true,
          },
        },
        { $limit: limit },
      ])
      .toArray();
    return results as FitnessGroup[];
  }

  return col.find({}).sort({ memberCount: -1, createdAt: -1 }).limit(limit).toArray();
}

export async function getFitnessGroupById(groupId: string): Promise<FitnessGroup | null> {
  return getCollection().findOne({ groupId });
}

export async function createFitnessGroup(params: {
  name: string;
  description: string;
  gymName?: string;
  postcode?: string;
  location?: GeoPoint;
  scheduleSummary?: string;
  createdBy?: string;
}): Promise<FitnessGroup> {
  const doc: FitnessGroup = {
    groupId: uuidv4(),
    name: params.name.trim(),
    description: params.description.trim(),
    gymName: params.gymName?.trim(),
    postcode: params.postcode?.trim().toUpperCase(),
    location: params.location,
    scheduleSummary: params.scheduleSummary?.trim(),
    memberCount: 0,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };
  await getCollection().insertOne(doc);
  return doc;
}
