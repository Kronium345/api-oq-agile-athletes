import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const COLLECTION = process.env.MONGO_PARTNER_CONNECT_COLLECTION || 'partner_connect_requests';

export type PartnerConnectStatus = 'pending' | 'accepted' | 'declined';

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

  if (existing?.status === 'pending' || existing?.status === 'accepted') {
    return existing;
  }

  const now = new Date().toISOString();

  if (existing?.status === 'declined') {
    await getCollection().updateOne(
      { requestId: existing.requestId },
      { $set: { fromUserId, toUserId, status: 'pending', createdAt: now } }
    );
    const updated = await getCollection().findOne({ requestId: existing.requestId });
    return updated!;
  }

  const doc: PartnerConnectRequest = {
    requestId: uuidv4(),
    fromUserId,
    toUserId,
    status: 'pending',
    createdAt: now,
  };
  await getCollection().insertOne(doc);
  return doc;
}

export async function getPartnerRequestById(
  requestId: string
): Promise<PartnerConnectRequest | null> {
  return getCollection().findOne({ requestId });
}

export async function listPartnerRequestsForUser(userId: string): Promise<{
  incoming: PartnerConnectRequest[];
  outgoing: PartnerConnectRequest[];
}> {
  const rows = await getCollection()
    .find({
      status: 'pending',
      $or: [{ toUserId: userId }, { fromUserId: userId }],
    })
    .sort({ createdAt: -1 })
    .toArray();

  return {
    incoming: rows.filter((r) => r.toUserId === userId),
    outgoing: rows.filter((r) => r.fromUserId === userId),
  };
}

export async function acceptPartnerRequestById(
  requestId: string,
  userId: string
): Promise<
  | { ok: true; request: PartnerConnectRequest }
  | { ok: false; status: number; message: string }
> {
  const request = await getPartnerRequestById(requestId);
  if (!request) {
    return { ok: false, status: 404, message: 'Request not found' };
  }
  if (request.toUserId !== userId) {
    return { ok: false, status: 403, message: 'Not authorized to accept this request' };
  }
  if (request.status === 'accepted') {
    return { ok: false, status: 409, message: 'Request already accepted' };
  }
  if (request.status === 'declined') {
    return { ok: false, status: 409, message: 'Request was declined' };
  }
  if (request.status !== 'pending') {
    return { ok: false, status: 409, message: 'Request is not pending' };
  }

  await getCollection().updateOne({ requestId }, { $set: { status: 'accepted' } });
  const updated = await getCollection().findOne({ requestId });
  return { ok: true, request: updated! };
}

export async function declinePartnerRequestById(
  requestId: string,
  userId: string
): Promise<
  | { ok: true; request: PartnerConnectRequest }
  | { ok: false; status: number; message: string }
> {
  const request = await getPartnerRequestById(requestId);
  if (!request) {
    return { ok: false, status: 404, message: 'Request not found' };
  }
  if (request.toUserId !== userId) {
    return { ok: false, status: 403, message: 'Not authorized to decline this request' };
  }
  if (request.status === 'declined') {
    return { ok: true, request };
  }
  if (request.status !== 'pending') {
    return { ok: false, status: 409, message: 'Request is not pending' };
  }

  await getCollection().updateOne({ requestId }, { $set: { status: 'declined' } });
  const updated = await getCollection().findOne({ requestId });
  return { ok: true, request: updated! };
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

/** User IDs with a pending partner request involving this user (sent or received). */
export async function listPendingPartnerUserIds(userId: string): Promise<string[]> {
  const rows = await getCollection()
    .find({
      status: 'pending',
      $or: [{ fromUserId: userId }, { toUserId: userId }],
    })
    .toArray();
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.fromUserId === userId ? row.toUserId : row.fromUserId);
  }
  return [...ids];
}
