import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_TRAINER_VIDEOS_COLLECTION || 'trainer_videos';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
let indexesEnsured = false;
export async function ensureTrainerVideoIndexes() {
    if (indexesEnsured)
        return;
    const col = getCollection();
    await col.createIndex({ videoId: 1 }, { unique: true });
    await col.createIndex({ trainerId: 1, createdAt: -1 });
    await col.createIndex({ assignedMemberIds: 1, createdAt: -1 });
    indexesEnsured = true;
}
export async function createTrainerVideo(input) {
    const now = new Date().toISOString();
    const doc = {
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
export async function getTrainerVideoById(videoId) {
    return getCollection().findOne({ videoId });
}
export async function getTrainerVideoForTrainer(trainerId, videoId) {
    return getCollection().findOne({ trainerId, videoId });
}
export async function listTrainerVideosForTrainer(trainerId) {
    return getCollection().find({ trainerId }).sort({ createdAt: -1 }).toArray();
}
export async function listAssignedVideosForMember(memberId) {
    return getCollection()
        .find({ assignedMemberIds: memberId })
        .sort({ createdAt: -1 })
        .toArray();
}
export async function listAssignedVideosForMemberFromTrainer(trainerId, memberId) {
    return getCollection()
        .find({ trainerId, assignedMemberIds: memberId })
        .sort({ createdAt: -1 })
        .toArray();
}
export async function updateTrainerVideo(trainerId, videoId, patch) {
    const now = new Date().toISOString();
    const result = await getCollection().findOneAndUpdate({ trainerId, videoId }, { $set: { ...patch, updatedAt: now } }, { returnDocument: 'after' });
    return result ?? null;
}
export async function deleteTrainerVideo(trainerId, videoId) {
    const result = await getCollection().findOneAndDelete({ trainerId, videoId });
    return result ?? null;
}
