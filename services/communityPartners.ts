import { getFriendUserIds } from '../models/userFriends.ts';
import { listPendingPartnerUserIds } from '../models/partnerConnectRequest.ts';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';
import { toPartnerListItem } from '../utils/communityResponse.ts';

export interface ListPartnersOptions {
  userId: string;
  gymName?: string;
  /** Explicit query override — hard filter when set */
  goal?: string;
  /** Caller profile goal — soft ranking only */
  preferredGoal?: string;
  experience?: string;
  gender?: string;
  limit?: number;
}

export async function listTrainingPartners(options: ListPartnersOptions) {
  const limit = Math.min(options.limit || 30, 50);
  const friendIds = await getFriendUserIds(options.userId);
  const pendingIds = await listPendingPartnerUserIds(options.userId);
  const excludeIds = [...new Set([options.userId, ...friendIds, ...pendingIds])];

  const filter: Record<string, unknown> = {
    userId: { $nin: excludeIds },
  };

  if (options.gymName?.trim()) {
    filter.gymName = { $regex: options.gymName.trim(), $options: 'i' };
  }

  const effectiveGoal = options.goal?.trim().toLowerCase();
  if (effectiveGoal) {
    filter.$or = [
      { experience: { $regex: effectiveGoal, $options: 'i' } },
      { goal: { $regex: effectiveGoal, $options: 'i' } },
      { fitnessGoal: { $regex: effectiveGoal, $options: 'i' } },
      { name: { $regex: effectiveGoal, $options: 'i' } },
    ];
  }

  const users = await getMongoClient()
    .db(getMongoDbName())
    .collection('users')
    .find(filter)
    .project({ password: 0, email: 0 })
    .sort({ name: 1, createdAt: -1 })
    .limit(limit * 2)
    .toArray();

  const callerExperience = options.experience?.trim().toLowerCase();
  const callerGender = options.gender?.trim().toLowerCase();
  const preferredGoal = options.preferredGoal?.trim().toLowerCase();

  const sorted = [...users].sort((a, b) => {
    const score = (u: Record<string, unknown>) => {
      let s = 0;
      const exp = typeof u.experience === 'string' ? u.experience.toLowerCase() : '';
      const gen = typeof u.gender === 'string' ? u.gender.toLowerCase() : '';
      const goal =
        typeof u.goal === 'string'
          ? u.goal.toLowerCase()
          : typeof u.fitnessGoal === 'string'
            ? u.fitnessGoal.toLowerCase()
            : '';
      if (callerExperience && exp === callerExperience) s += 2;
      if (callerGender && gen === callerGender) s += 1;
      if (preferredGoal && goal.includes(preferredGoal)) s += 1;
      return s;
    };
    return score(b as Record<string, unknown>) - score(a as Record<string, unknown>);
  });

  return sorted.slice(0, limit).map((u) => toPartnerListItem(u as Record<string, unknown>));
}
