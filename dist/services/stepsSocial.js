import { getStepHistoryForUsers } from "../models/stepHistory.js";
import { addFriend, friendshipExists, getFriendUserIds, removeFriend, } from "../models/userFriends.js";
import { getUserById, getUsersByIds, listUserSuggestions, listUsersWithStepSharing, updateUser, } from "../models/user.js";
import { addDaysUtc, streakLookbackStartUtc, todayUtc, weekStartMondayUtc } from "../utils/stepDates.js";
import { getAvatarLetter, getDisplayName, isShareStepsEnabled, toPublicUserCard, } from "../utils/userDisplay.js";
function buildCountMaps(items) {
    const byUser = new Map();
    for (const item of items) {
        if (!byUser.has(item.userId))
            byUser.set(item.userId, new Map());
        byUser.get(item.userId).set(item.date, Number(item.stepCount) || 0);
    }
    return byUser;
}
function calculateStreak(countByDate, today) {
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
function computeStats(countByDate, today, weekStart) {
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
async function fetchStatsForUserIds(userIds) {
    const today = todayUtc();
    const weekStart = weekStartMondayUtc(today);
    const lookbackStart = streakLookbackStartUtc(today);
    const items = await getStepHistoryForUsers(userIds, lookbackStart, today);
    const maps = buildCountMaps(items);
    const result = new Map();
    for (const userId of userIds) {
        const countByDate = maps.get(userId) ?? new Map();
        result.set(userId, computeStats(countByDate, today, weekStart));
    }
    return result;
}
function statsForViewer(targetUser, viewerUserId, stats) {
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
export async function getSuggestions(userId, limit) {
    const friendIds = await getFriendUserIds(userId);
    const exclude = [userId, ...friendIds];
    const users = await listUserSuggestions(exclude, limit);
    return users.map((u) => toPublicUserCard(u));
}
export async function getFriendsList(userId) {
    const friendIds = await getFriendUserIds(userId);
    if (!friendIds.length)
        return [];
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
export async function addFriendship(userId, friendUserId) {
    if (friendUserId === userId) {
        return { ok: false, status: 400, message: 'Cannot add yourself as a friend' };
    }
    const friend = await getUserById(friendUserId);
    if (!friend) {
        return { ok: false, status: 404, message: 'User not found' };
    }
    if (await friendshipExists(userId, friendUserId)) {
        return { ok: false, status: 409, message: 'Already friends' };
    }
    await addFriend(userId, friendUserId);
    return { ok: true, status: 201, friendUserId };
}
export async function removeFriendship(userId, friendUserId) {
    const removed = await removeFriend(userId, friendUserId);
    if (!removed) {
        return { ok: false, status: 404, message: 'Friend not found' };
    }
    return { ok: true, status: 200 };
}
export async function updateStepSharing(userId, shareStepsEnabled) {
    const updated = await updateUser(userId, { shareStepsEnabled });
    if (!updated) {
        return { ok: false, status: 404, message: 'User not found' };
    }
    return { ok: true, shareStepsEnabled: isShareStepsEnabled(updated) };
}
function metricValue(stats, period) {
    if (period === 'streaks')
        return stats.streak;
    if (period === 'week')
        return stats.stepsWeek;
    return stats.stepsToday;
}
export async function getLeaderboard(userId, period, scope, limit) {
    const friendIds = await getFriendUserIds(userId);
    let candidateUsers;
    if (scope === 'all') {
        candidateUsers = await listUsersWithStepSharing(Math.max(limit, 50));
        const self = await getUserById(userId);
        if (self && !candidateUsers.some((u) => u.userId === userId)) {
            candidateUsers.push(self);
        }
    }
    else {
        const ids = [userId, ...friendIds];
        candidateUsers = await getUsersByIds(ids);
    }
    const candidateIds = candidateUsers.map((u) => u.userId);
    const statsMap = await fetchStatsForUserIds(candidateIds);
    const entries = candidateUsers
        .filter((user) => {
        if (user.userId === userId)
            return true;
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
