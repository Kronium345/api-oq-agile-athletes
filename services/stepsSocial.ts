import { getStepHistoryForUsers } from '../models/stepHistory.ts';
import {
  addFriend,
  friendshipExists,
  getFriendUserIds,
  removeFriend,
} from '../models/userFriends.ts';
import {
  getUserById,
  getUsersByIds,
  listUserSuggestions,
  listUsersWithStepSharing,
  updateUser,
} from '../models/user.ts';
import { addDaysUtc, streakLookbackStartUtc, todayUtc, weekStartMondayUtc } from '../utils/stepDates.ts';
import {
  getAvatarLetter,
  getDisplayName,
  isShareStepsEnabled,
  toPublicUserCard,
  type UserLike,
} from '../utils/userDisplay.ts';

export type LeaderboardPeriod = 'streaks' | 'today' | 'week';
export type LeaderboardScope = 'friends' | 'all';

export interface StepStats {
  stepsToday: number;
  stepsWeek: number;
  streak: number;
}

function buildCountMaps(
  items: Array<{ userId: string; date: string; stepCount: number }>
): Map<string, Map<string, number>> {
  const byUser = new Map<string, Map<string, number>>();
  for (const item of items) {
    if (!byUser.has(item.userId)) byUser.set(item.userId, new Map());
    byUser.get(item.userId)!.set(item.date, Number(item.stepCount) || 0);
  }
  return byUser;
}

function calculateStreak(countByDate: Map<string, number>, today: string): number {
  let streak = 0;
  let cursor = today;
  if ((countByDate.get(today) ?? 0) <= 0) {
    cursor = addDaysUtc(today, -1);
  }
  while ((countByDate.get(cursor) ?? 0) > 0) {
    streak += 1;
    cursor = addDaysUtc(cursor, -1);
  }
  return streak;
}

function computeStats(countByDate: Map<string, number>, today: string, weekStart: string): StepStats {
  const stepsToday = countByDate.get(today) ?? 0;
  let stepsWeek = 0;
  let d = weekStart;
  while (d <= today) {
    stepsWeek += countByDate.get(d) ?? 0;
    d = addDaysUtc(d, 1);
  }
  return {
    stepsToday,
    stepsWeek,
    streak: calculateStreak(countByDate, today),
  };
}

async function fetchStatsForUserIds(userIds: string[]): Promise<Map<string, StepStats>> {
  const today = todayUtc();
  const weekStart = weekStartMondayUtc(today);
  const lookbackStart = streakLookbackStartUtc(today);
  const items = await getStepHistoryForUsers(userIds, lookbackStart, today);
  const maps = buildCountMaps(items);
  const result = new Map<string, StepStats>();

  for (const userId of userIds) {
    const countByDate = maps.get(userId) ?? new Map();
    result.set(userId, computeStats(countByDate, today, weekStart));
  }
  return result;
}

function statsForViewer(
  targetUser: UserLike & { userId: string },
  viewerUserId: string,
  stats: StepStats
): {
  streak: number | null;
  stepsToday: number | null;
  stepsWeek: number | null;
  shareStepsEnabled: boolean;
} {
  const sharing = isShareStepsEnabled(targetUser);
  const isSelf = targetUser.userId === viewerUserId;
  if (isSelf || sharing) {
    return {
      streak: stats.streak,
      stepsToday: stats.stepsToday,
      stepsWeek: stats.stepsWeek,
      shareStepsEnabled: sharing,
    };
  }
  return {
    streak: null,
    stepsToday: null,
    stepsWeek: null,
    shareStepsEnabled: false,
  };
}

export async function getSuggestions(userId: string, limit: number) {
  const friendIds = await getFriendUserIds(userId);
  const exclude = [userId, ...friendIds];
  const users = await listUserSuggestions(exclude, limit);
  return users.map((u) => toPublicUserCard(u));
}

export async function getFriendsList(userId: string) {
  const friendIds = await getFriendUserIds(userId);
  if (!friendIds.length) return [];

  const users = await getUsersByIds(friendIds);
  const statsMap = await fetchStatsForUserIds(friendIds);

  return users.map((user) => {
    const card = toPublicUserCard(user);
    const stats = statsMap.get(user.userId) ?? { stepsToday: 0, stepsWeek: 0, streak: 0 };
    const visible = statsForViewer(user, userId, stats);
    return {
      ...card,
      avatar: card.avatar,
      ...visible,
    };
  });
}

export async function addFriendship(userId: string, friendUserId: string) {
  if (friendUserId === userId) {
    return { ok: false as const, status: 400, message: 'Cannot add yourself as a friend' };
  }
  const friend = await getUserById(friendUserId);
  if (!friend) {
    return { ok: false as const, status: 404, message: 'User not found' };
  }
  if (await friendshipExists(userId, friendUserId)) {
    return { ok: false as const, status: 409, message: 'Already friends' };
  }
  await addFriend(userId, friendUserId);
  return { ok: true as const, status: 201, friendUserId };
}

export async function removeFriendship(userId: string, friendUserId: string) {
  const removed = await removeFriend(userId, friendUserId);
  if (!removed) {
    return { ok: false as const, status: 404, message: 'Friend not found' };
  }
  return { ok: true as const, status: 200 };
}

export async function updateStepSharing(userId: string, shareStepsEnabled: boolean) {
  const updated = await updateUser(userId, { shareStepsEnabled });
  if (!updated) {
    return { ok: false as const, status: 404, message: 'User not found' };
  }
  return { ok: true as const, shareStepsEnabled: isShareStepsEnabled(updated) };
}

function metricValue(stats: StepStats, period: LeaderboardPeriod): number {
  if (period === 'streaks') return stats.streak;
  if (period === 'week') return stats.stepsWeek;
  return stats.stepsToday;
}

export async function getLeaderboard(
  userId: string,
  period: LeaderboardPeriod,
  scope: LeaderboardScope,
  limit: number
) {
  const friendIds = await getFriendUserIds(userId);
  let candidateUsers;

  if (scope === 'all') {
    candidateUsers = await listUsersWithStepSharing(Math.max(limit, 50));
    const self = await getUserById(userId);
    if (self && !candidateUsers.some((u) => u.userId === userId)) {
      candidateUsers.push(self);
    }
  } else {
    const ids = [userId, ...friendIds];
    candidateUsers = await getUsersByIds(ids);
  }

  const candidateIds = candidateUsers.map((u) => u.userId);
  const statsMap = await fetchStatsForUserIds(candidateIds);

  const entries = candidateUsers
    .filter((user) => {
      if (user.userId === userId) return true;
      return isShareStepsEnabled(user);
    })
    .map((user) => {
      const displayName = getDisplayName(user);
      const stats = statsMap.get(user.userId) ?? { stepsToday: 0, stepsWeek: 0, streak: 0 };
      return {
        userId: user.userId,
        displayName,
        avatarLetter: getAvatarLetter(displayName),
        value: metricValue(stats, period),
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

  return { period, entries };
}
