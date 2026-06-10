import type { FitnessGroup } from '../models/fitnessGroup.ts';
import type { PartnerConnectRequest } from '../models/partnerConnectRequest.ts';
import type { UserWithoutPassword } from '../models/user.ts';
import { getDisplayName } from './userDisplay.ts';

export interface CommunityUserProfile {
  userId: string;
  displayName: string;
  gymName?: string;
  postcode?: string;
  experience?: string;
  gender?: string;
  weight?: number;
  unit?: string;
  goal?: string;
}

export interface PartnerListItem extends CommunityUserProfile {
  avatar: string | null;
}

export function toCommunityUserProfile(
  user: UserWithoutPassword | Record<string, unknown> | undefined
): CommunityUserProfile {
  const profile = user as Record<string, unknown> | undefined;
  const goal =
    profile && typeof profile.goal === 'string'
      ? profile.goal
      : profile && typeof profile.fitnessGoal === 'string'
        ? profile.fitnessGoal
        : undefined;

  return {
    userId: profile ? String(profile.userId) : '',
    displayName: profile ? getDisplayName(profile as UserWithoutPassword) : 'User',
    gymName: typeof profile?.gymName === 'string' ? profile.gymName : undefined,
    postcode: typeof profile?.postcode === 'string' ? profile.postcode : undefined,
    experience: typeof profile?.experience === 'string' ? profile.experience : undefined,
    gender: typeof profile?.gender === 'string' ? profile.gender : undefined,
    weight: typeof profile?.weight === 'number' ? profile.weight : undefined,
    unit: typeof profile?.unit === 'string' ? profile.unit : undefined,
    goal,
  };
}

export function toPartnerListItem(user: Record<string, unknown>): PartnerListItem {
  return {
    ...toCommunityUserProfile(user),
    avatar: typeof user.avatar === 'string' ? user.avatar : null,
  };
}

export interface PendingConnectionRequest {
  id: string;
  status: 'pending';
  direction: 'incoming' | 'outgoing';
  createdAt: string;
  user: CommunityUserProfile;
}

export function toPendingConnectionRequest(
  request: PartnerConnectRequest,
  otherUser: UserWithoutPassword | undefined,
  direction: 'incoming' | 'outgoing'
): PendingConnectionRequest {
  return {
    id: request.requestId,
    status: 'pending',
    direction,
    createdAt: request.createdAt,
    user: toCommunityUserProfile(otherUser),
  };
}

export interface AcceptedConnection {
  id: string;
  status: 'accepted';
  user: CommunityUserProfile;
}

export function toAcceptedConnection(
  friendUser: UserWithoutPassword,
  connectionId: string
): AcceptedConnection {
  return {
    id: connectionId,
    status: 'accepted',
    user: toCommunityUserProfile(friendUser),
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
