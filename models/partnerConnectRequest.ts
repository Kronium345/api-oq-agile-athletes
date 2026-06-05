import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const COLLECTION = process.env.MONGO_PARTNER_CONNECT_COLLECTION || 'partner_connect_requests';

export type PartnerConnectStatus = 'pending' | 'accepted';

export interface PartnerConnectRequest {
  requestId: string;
  fromUserId: string;
  toUserId: string;
  status: PartnerConnectStatus;
  createdAt: string;
}

function getCollection(): Collection<PartnerConnectRequest> {
  return getMongoClient().db(getMongoDbName()).collection<PartnerConnectRequest>(COLLECTION);
}

export async function createPartnerRequest(
  fromUserId: string,
  toUserId: string
): Promise<PartnerConnectRequest> {
  const existing = await getCollection().findOne({
    $or: [
      { fromUserId, toUserId },
      { fromUserId: toUserId, toUserId: fromUserId },
    ],
  });
  if (existing) return existing;

  const doc: PartnerConnectRequest = {
    requestId: uuidv4(),
    fromUserId,
    toUserId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await getCollection().insertOne(doc);
  return doc;
}

export async function acceptPartnerRequest(
  fromUserId: string,
  toUserId: string
): Promise<PartnerConnectRequest | null> {
  await getCollection().updateOne(
    { fromUserId, toUserId, status: 'pending' },
    { $set: { status: 'accepted' } }
  );
  return getCollection().findOne({ fromUserId, toUserId });
}

export async function getPartnerRequestBetween(
  userA: string,
  userB: string
): Promise<PartnerConnectRequest | null> {
  return getCollection().findOne({
    $or: [
      { fromUserId: userA, toUserId: userB },
      { fromUserId: userB, toUserId: userA },
    ],
  });
}
