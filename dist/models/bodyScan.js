import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_BODY_SCANS_COLLECTION || 'body_scans';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
let indexesEnsured = false;
export async function ensureBodyScanIndexes() {
    if (indexesEnsured)
        return;
    const col = getCollection();
    await col.createIndex({ userId: 1, createdAt: -1 });
    indexesEnsured = true;
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asMeasurements(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw === 'number' && Number.isFinite(raw))
            out[key] = raw;
    }
    return Object.keys(out).length ? out : null;
}
export async function saveBodyScan(params) {
    const warnings = Array.isArray(params.result.warnings)
        ? params.result.warnings.filter((w) => typeof w === 'string')
        : [];
    const doc = {
        scanId: uuidv4(),
        userId: params.userId,
        createdAt: new Date().toISOString(),
        bodyFatPercent: asNumber(params.result.body_fat_percent),
        bmi: asNumber(params.result.bmi),
        measurementsCm: asMeasurements(params.result.measurements_cm),
        confidence: typeof params.result.confidence === 'string' ? params.result.confidence : null,
        warnings,
        disclaimer: typeof params.result.disclaimer === 'string' ? params.result.disclaimer : null,
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
export async function listBodyScansForUser(userId, limit = 20) {
    return getCollection()
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(Math.min(Math.max(1, limit), 50))
        .toArray();
}
export async function getLatestBodyScanForUser(userId) {
    return getCollection().findOne({ userId }, { sort: { createdAt: -1 } });
}
export async function countBodyScansSince(userId, sinceIso) {
    return getCollection().countDocuments({
        userId,
        createdAt: { $gte: sinceIso },
    });
}
