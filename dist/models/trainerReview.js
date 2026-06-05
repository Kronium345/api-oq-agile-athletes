import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_TRAINER_REVIEWS_COLLECTION || 'trainer_reviews';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
let indexesEnsured = false;
export async function ensureTrainerReviewIndexes() {
    if (indexesEnsured)
        return;
    await getCollection().createIndex({ trainerId: 1, memberId: 1 }, { unique: true });
    await getCollection().createIndex({ trainerId: 1, createdAt: -1 });
    indexesEnsured = true;
}
export async function getReviewsForTrainer(trainerId, limit = 50) {
    return getCollection()
        .find({ trainerId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
}
export async function getReviewByMember(trainerId, memberId) {
    return getCollection().findOne({ trainerId, memberId });
}
export async function createTrainerReview(params) {
    const doc = {
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
