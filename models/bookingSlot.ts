import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const COLLECTION = process.env.MONGO_BOOKING_SLOTS_COLLECTION || 'booking_slots';

export interface BookingSlot {
  slotId: string;
  trainerId: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
}

function getCollection(): Collection<BookingSlot> {
  return getMongoClient().db(getMongoDbName()).collection<BookingSlot>(COLLECTION);
}

export async function listAvailableSlots(trainerId: string): Promise<BookingSlot[]> {
  const now = new Date().toISOString();
  return getCollection()
    .find({ trainerId, available: true, startsAt: { $gte: now } })
    .sort({ startsAt: 1 })
    .toArray();
}

export async function getSlotById(slotId: string): Promise<BookingSlot | null> {
  return getCollection().findOne({ slotId });
}

export async function replaceTrainerSlots(
  trainerId: string,
  slots: Array<{ startsAt: string; endsAt: string; available?: boolean }>
): Promise<BookingSlot[]> {
  const col = getCollection();
  await col.deleteMany({ trainerId });
  if (!slots.length) return [];

  const docs: BookingSlot[] = slots.map((s) => ({
    slotId: uuidv4(),
    trainerId,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    available: s.available !== false,
  }));
  await col.insertMany(docs);
  return docs;
}

export async function markSlotUnavailable(slotId: string): Promise<void> {
  await getCollection().updateOne({ slotId }, { $set: { available: false } });
}

export async function markSlotAvailable(slotId: string): Promise<void> {
  await getCollection().updateOne({ slotId }, { $set: { available: true } });
}
