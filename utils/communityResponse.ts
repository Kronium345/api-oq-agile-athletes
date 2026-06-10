import type { FitnessGroup } from '../models/fitnessGroup.ts';
import type { PartnerConnectRequest } from '../models/partnerConnectRequest.ts';
import type { UserWithoutPassword } from '../models/user.ts';
import { getDisplayName } from './userDisplay.ts';

export interface PartnerListItem {
  userId: string;
  displayName: string;
  avatar: string | null;
  gymName?: string | null;
  goal?: string | null;
  experience?: string | null;
}

export function toPartnerListItem(user: Record<string, unknown>): PartnerListItem {
  const displayName = getDisplayName(user as { name?: string; firstName?: string; username?: string });
  const goal =
    typeof user.goal === 'string'
      ? user.goal
      : typeof user.fitnessGoal === 'string'
        ? user.fitnessGoal
        : null;

  return {
    userId: String(user.userId),
    displayName,
    avatar: typeof user.avatar === 'string' ? user.avatar : null,
    gymName: typeof user.gymName === 'string' ? user.gymName : null,
    goal,
    experience: typeof user.experience === 'string' ? user.experience : null,
  };
}

export interface ConnectionRequestItem {
  requestId: string;
  direction: 'incoming' | 'outgoing';
  userId: string;
  displayName: string;
  avatar: string | null;
  gymName?: string | null;
  experience?: string | null;
  goal?: string | null;
  status: 'pending';
  createdAt: string;
}

export function toConnectionRequestItem(
  request: PartnerConnectRequest,
  otherUser: UserWithoutPassword | undefined,
  direction: 'incoming' | 'outgoing'
): ConnectionRequestItem {
  const profile = otherUser as Record<string, unknown> | undefined;
  const goal =
    profile && typeof profile.goal === 'string'
      ? profile.goal
      : profile && typeof profile.fitnessGoal === 'string'
        ? profile.fitnessGoal
        : null;

  const otherUserId = direction === 'incoming' ? request.fromUserId : request.toUserId;

  return {
    requestId: request.requestId,
    direction,
    userId: otherUserId,
    displayName: otherUser ? getDisplayName(otherUser) : 'User',
    avatar: otherUser && typeof otherUser.avatar === 'string' ? otherUser.avatar : null,
    gymName: otherUser && typeof otherUser.gymName === 'string' ? otherUser.gymName : null,
    experience:
      otherUser && typeof otherUser.experience === 'string' ? otherUser.experience : null,
    goal,
    status: 'pending',
    createdAt: request.createdAt,
  };
}

export function toClientGroup(group: FitnessGroup) {
  return {
    id: group.groupId,
    _id: group.groupId,
    name: group.name,
    description: group.description,
    gymName: group.gymName,
    postcode: group.postcode,
    city: group.city,
    category: group.category,
    scheduleSummary: group.scheduleSummary,
    memberCount: group.memberCount,
    verified: group.verified ?? false,
    source: group.source,
    lastVerified: group.lastVerified,
    sourceUrl: group.sourceUrl,
  };
}

export function parseQueryNumber(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}
