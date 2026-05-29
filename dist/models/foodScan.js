import { ObjectId } from 'mongodb';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const FOOD_SCAN_TABLE = process.env.MONGO_FOOD_SCAN_COLLECTION || 'food_scans';
function getFoodScanCollection() {
    const client = getMongoClient();
    return client.db(getMongoDbName()).collection(FOOD_SCAN_TABLE);
}
function serializeScan(doc) {
    return {
        ...doc,
        _id: doc._id?.toString(),
        date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
    };
}
async function createFoodScan(userId, foodItems, date = new Date()) {
    const collection = getFoodScanCollection();
    const doc = { userId, foodItems, date };
    const result = await collection.insertOne(doc);
    return { ...doc, _id: result.insertedId };
}
async function getFoodScansByUserId(userId) {
    return getFoodScanCollection().find({ userId }).sort({ date: -1 }).toArray();
}
async function getFoodScanById(userId, id) {
    if (!ObjectId.isValid(id))
        return null;
    return getFoodScanCollection().findOne({ _id: new ObjectId(id), userId });
}
async function deleteFoodScan(userId, id) {
    if (!ObjectId.isValid(id))
        return false;
    const result = await getFoodScanCollection().deleteOne({ _id: new ObjectId(id), userId });
    return result.deletedCount === 1;
}
async function findScansInRange(start, end, userId) {
    const filter = {
        date: { $gte: start, $lte: end },
    };
    if (userId)
        filter.userId = userId;
    return getFoodScanCollection().find(filter).sort({ date: -1 }).toArray();
}
async function deleteFoodScansByUserId(userId) {
    const result = await getFoodScanCollection().deleteMany({ userId });
    return result.deletedCount;
}
export { createFoodScan, deleteFoodScan, deleteFoodScansByUserId, findScansInRange, getFoodScanById, getFoodScansByUserId, serializeScan, };
