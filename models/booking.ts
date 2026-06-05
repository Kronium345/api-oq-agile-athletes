import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const COLLECTION = process.env.MONGO_BOOKINGS_COLLECTION || 'bookings';

export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'completed';

export interface Booking {
  bookingId: string;
  trainerId: string;
  memberId: string;
  slotId: string;
  startsAt: string;
  endsAt: string;
  amountPence: number;
  currency: 'gbp';
  platformFeePence: number;
  trainerPayoutPence: number;
  status: BookingStatus;
  stripePaymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
}

function getCollection(): Collection<Booking> {
  return getMongoClient().db(getMongoDbName()).collection<Booking>(COLLECTION);
}

export async function createBooking(params: {
  trainerId: string;
  memberId: string;
  slotId: string;
  startsAt: string;
  endsAt: string;
  amountPence: number;
  platformFeePence: number;
  trainerPayoutPence: number;
  stripePaymentIntentId?: string;
}): Promise<Booking> {
  const now = new Date().toISOString();
  const doc: Booking = {
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

export async function getBookingById(bookingId: string): Promise<Booking | null> {
  return getCollection().findOne({ bookingId });
}

export async function updateBooking(
  bookingId: string,
  updates: Partial<Omit<Booking, 'bookingId' | 'createdAt'>>
): Promise<Booking | null> {
  const updateDoc = { ...updates, updatedAt: new Date().toISOString() };
  await getCollection().updateOne({ bookingId }, { $set: updateDoc });
  return getBookingById(bookingId);
}

export async function listBookingsForUser(
  userId: string,
  trainerProfileId?: string | null
): Promise<Booking[]> {
  const filter = trainerProfileId
    ? { $or: [{ memberId: userId }, { trainerId: trainerProfileId }] }
    : { memberId: userId };

  return getCollection().find(filter).sort({ startsAt: -1 }).toArray();
}
