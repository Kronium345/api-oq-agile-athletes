import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_FORM_ANALYSES_COLLECTION || 'form_analyses';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
let indexesEnsured = false;
export async function ensureFormAnalysisIndexes() {
    if (indexesEnsured)
        return;
    const col = getCollection();
    await col.createIndex({ userId: 1, createdAt: -1 });
    indexesEnsured = true;
}
export async function saveFormAnalysis(params) {
    const doc = {
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
export async function listFormAnalysesForUser(userId, limit = 20) {
    return getCollection()
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 50))
        .toArray();
}
export async function countFormAnalysesSince(userId, sinceIso) {
    return getCollection().countDocuments({
        userId,
        createdAt: { $gte: sinceIso },
    });
}
