import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_BOOKING_SLOTS_COLLECTION || 'booking_slots';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
export async function listAvailableSlots(trainerId) {
    const now = new Date().toISOString();
    return getCollection()
        .find({ trainerId, available: true, startsAt: { $gte: now } })
        .sort({ startsAt: 1 })
        .toArray();
}
export async function getSlotById(slotId) {
    return getCollection().findOne({ slotId });
}
export async function replaceTrainerSlots(trainerId, slots) {
    const col = getCollection();
    await col.deleteMany({ trainerId });
    if (!slots.length)
        return [];
    const docs = slots.map((s) => ({
        slotId: uuidv4(),
        trainerId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        available: s.available !== false,
    }));
    await col.insertMany(docs);
    return docs;
}
export async function markSlotUnavailable(slotId) {
    await getCollection().updateOne({ slotId }, { $set: { available: false } });
}
export async function markSlotAvailable(slotId) {
    await getCollection().updateOne({ slotId }, { $set: { available: true } });
}
