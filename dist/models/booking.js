import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const COLLECTION = process.env.MONGO_BOOKINGS_COLLECTION || 'bookings';
function getCollection() {
    return getMongoClient().db(getMongoDbName()).collection(COLLECTION);
}
export async function createBooking(params) {
    const now = new Date().toISOString();
    const doc = {
        bookingId: uuidv4(),
        trainerId: params.trainerId,
        memberId: params.memberId,
        slotId: params.slotId,
        startsAt: params.startsAt,
        endsAt: params.endsAt,
        amountPence: params.amountPence,
        currency: 'gbp',
        platformFeePence: params.platformFeePence,
        trainerPayoutPence: params.trainerPayoutPence,
        status: 'pending_payment',
        stripePaymentIntentId: params.stripePaymentIntentId,
        createdAt: now,
        updatedAt: now,
    };
    await getCollection().insertOne(doc);
    return doc;
}
export async function getBookingById(bookingId) {
    return getCollection().findOne({ bookingId });
}
export async function updateBooking(bookingId, updates) {
    const updateDoc = { ...updates, updatedAt: new Date().toISOString() };
    await getCollection().updateOne({ bookingId }, { $set: updateDoc });
    return getBookingById(bookingId);
}
export async function listBookingsForUser(userId, trainerProfileId) {
    const filter = trainerProfileId
        ? { $or: [{ memberId: userId }, { trainerId: trainerProfileId }] }
        : { memberId: userId };
    return getCollection().find(filter).sort({ startsAt: -1 }).toArray();
}
