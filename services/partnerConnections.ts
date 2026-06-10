import {
  acceptPartnerRequest,
  acceptPartnerRequestById,
  createPartnerRequest,
  declinePartnerRequestById,
  getPartnerRequestBetween,
  listPartnerRequestsForUser,
} from '../models/partnerConnectRequest.ts';
import { friendshipExists } from '../models/userFriends.ts';
import { getUserById, getUsersByIds } from '../models/user.ts';
import { addFriendship } from './stepsSocial.ts';
import {
  sendPartnerConnectAcceptedEmail,
  sendPartnerConnectRequestEmail,
} from '../utils/partnerConnectionEmail.ts';
import { toConnectionRequestItem } from '../utils/communityResponse.ts';

export type ConnectResult =
  | { ok: true; connectionStatus: 'pending' | 'accepted'; message: string; requestId?: string }
  | { ok: false; httpStatus: number; message: string };

function notifyPartnerRequestEmail(
  recipientId: string,
  senderId: string,
  requestId: string
): void {
  void (async () => {
    try {
      const [recipient, sender] = await Promise.all([
        getUserById(recipientId),
        getUserById(senderId),
      ]);
      if (!recipient || !sender) return;
      await sendPartnerConnectRequestEmail(recipient, sender, requestId);
    } catch (err) {
      console.error('[partner] connect request email failed:', err);
    }
  })();
}

function notifyPartnerAcceptedEmail(accepterId: string, originalSenderId: string): void {
  void (async () => {
    try {
      const [accepter, originalSender] = await Promise.all([
        getUserById(accepterId),
        getUserById(originalSenderId),
      ]);
      if (!accepter || !originalSender) return;
      await sendPartnerConnectAcceptedEmail(originalSender, accepter);
    } catch (err) {
      console.error('[partner] connect accepted email failed:', err);
    }
  })();
}

export async function sendPartnerConnect(fromUserId: string, toUserId: string): Promise<ConnectResult> {
  if (toUserId === fromUserId) {
    return { ok: false, httpStatus: 400, message: 'Cannot connect with yourself' };
  }

  const target = await getUserById(toUserId);
  if (!target) {
    return { ok: false, httpStatus: 404, message: 'User not found' };
  }

  if (await friendshipExists(fromUserId, toUserId)) {
    return { ok: false, httpStatus: 409, message: 'Already connected' };
  }

  const existing = await getPartnerRequestBetween(fromUserId, toUserId);

  if (existing?.status === 'accepted') {
    return { ok: true, connectionStatus: 'accepted', message: 'Already connected' };
  }

  if (existing?.status === 'pending') {
    if (existing.fromUserId === toUserId) {
      await acceptPartnerRequest(toUserId, fromUserId);
      const friendResult = await addFriendship(fromUserId, toUserId);
      if (!friendResult.ok && friendResult.status !== 409) {
        return { ok: false, httpStatus: friendResult.status, message: friendResult.message };
      }
      notifyPartnerAcceptedEmail(fromUserId, toUserId);
      return {
        ok: true,
        connectionStatus: 'accepted',
        message: 'Partner connection accepted',
        requestId: existing.requestId,
      };
    }

    return {
      ok: true,
      connectionStatus: 'pending',
      message: 'Connect request sent',
      requestId: existing.requestId,
    };
  }

  const created = await createPartnerRequest(fromUserId, toUserId);
  notifyPartnerRequestEmail(toUserId, fromUserId, created.requestId);

  return {
    ok: true,
    connectionStatus: 'pending',
    message: 'Connect request sent',
    requestId: created.requestId,
  };
}

export async function listPendingConnections(userId: string) {
  const { incoming, outgoing } = await listPartnerRequestsForUser(userId);
  const userIds = [
    ...new Set([
      ...incoming.map((r) => r.fromUserId),
      ...outgoing.map((r) => r.toUserId),
    ]),
  ];
  const users = await getUsersByIds(userIds);
  const userMap = new Map(users.map((u) => [u.userId, u]));

  return {
    incoming: incoming.map((r) =>
      toConnectionRequestItem(r, userMap.get(r.fromUserId), 'incoming')
    ),
    outgoing: outgoing.map((r) =>
      toConnectionRequestItem(r, userMap.get(r.toUserId), 'outgoing')
    ),
  };
}

export async function acceptConnection(
  requestId: string,
  userId: string
): Promise<{ ok: true; message: string } | { ok: false; httpStatus: number; message: string }> {
  const result = await acceptPartnerRequestById(requestId, userId);
  if (result.ok === false) {
    return { ok: false, httpStatus: result.status, message: result.message };
  }

  const request = result.request!;
  const friendResult = await addFriendship(request.fromUserId, request.toUserId);
  if (!friendResult.ok && friendResult.status !== 409) {
    return { ok: false, httpStatus: friendResult.status, message: friendResult.message };
  }

  notifyPartnerAcceptedEmail(request.toUserId, request.fromUserId);

  return { ok: true, message: 'Partner connection accepted' };
}

export async function declineConnection(
  requestId: string,
  userId: string
): Promise<{ ok: true; message: string } | { ok: false; httpStatus: number; message: string }> {
  const result = await declinePartnerRequestById(requestId, userId);
  if (result.ok === false) {
    return { ok: false, httpStatus: result.status, message: result.message };
  }
  return { ok: true, message: 'Request declined' };
}
