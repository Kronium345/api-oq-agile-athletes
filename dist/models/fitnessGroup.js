import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_FITNESS_GROUPS_COLLECTION || 'fitness_groups';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
let indexesEnsured = false;
export async function ensureFitnessGroupIndexes() {
    if (indexesEnsured)
        return;
    await getCollection().createIndex({ location: '2dsphere' });
    indexesEnsured = true;
}
export async function listFitnessGroups(query) {
    const col = getCollection();
    const limit = Math.min(query.limit || 20, 50);
    if (query.nearLat != null &&
        query.nearLng != null &&
        query.radiusKm != null &&
        query.radiusKm > 0) {
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
        return results;
    }
    return col.find({}).sort({ verified: -1, name: 1, createdAt: -1 }).limit(limit).toArray();
}
export async function getFitnessGroupById(groupId) {
    return getCollection().findOne({ groupId });
}
export async function createFitnessGroup(params) {
    const doc = {
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
