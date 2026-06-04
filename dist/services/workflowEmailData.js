import dayjs from 'dayjs';
import { getStepHistory, getStepsByDate, markGoalAchieved } from "../models/stepHistory.js";
import { getUserById, updateUser } from "../models/user.js";
import { getLeaderboard } from "./stepsSocial.js";
import { resolveEmailNotifications } from "../utils/emailNotifications.js";
import { getDisplayName } from "../utils/userDisplay.js";
import { addDaysUtc, todayUtc, weekStartMondayUtc } from "../utils/stepDates.js";
export const STREAK_MILESTONE_DAYS = [7, 14, 30, 60, 100];
export async function fetchUserForWorkflow(userId) {
    return getUserById(userId);
}
export function userWantsEmail(user, key) {
    if (!user?.email)
        return false;
    const prefs = resolveEmailNotifications(user);
    return prefs[key];
}
export async function getTodayStepData(userId) {
    const today = todayUtc();
    const user = await getUserById(userId);
    const dailyGoal = user?.dailyStepGoal ?? 8000;
    const stepHistory = await getStepsByDate(userId, today);
    const currentSteps = stepHistory?.stepCount ?? 0;
    const streakDays = await calculateGoalStreakDays(userId, dailyGoal);
    return {
        currentSteps,
        dailyGoal,
        streakDays,
        date: today,
    };
}
export async function getWeeklyStepData(userId) {
    const today = todayUtc();
    const weekStart = weekStartMondayUtc(today);
    const items = await getStepHistory(userId, weekStart, today);
    const totalSteps = items.reduce((sum, i) => sum + (i.stepCount || 0), 0);
    const daysActive = items.filter((i) => i.stepCount > 0).length;
    const averageSteps = daysActive ? Math.round(totalSteps / daysActive) : 0;
    return {
        totalSteps,
        daysActive,
        averageSteps,
        weekStart: dayjs(weekStart).format('MMMM DD'),
        weekEnd: dayjs(today).format('MMMM DD'),
        weeklySteps: totalSteps,
    };
}
export async function getLeaderboardCompetitor(userId) {
    const { entries } = await getLeaderboard(userId, 'today', 'friends', 20);
    const self = entries.find((e) => e.userId === userId);
    if (!self)
        return { closeCompetitor: null };
    const selfSteps = self.value ?? 0;
    const ahead = entries
        .filter((e) => e.userId !== userId && (e.value ?? 0) > selfSteps)
        .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0];
    if (!ahead)
        return { closeCompetitor: null };
    return {
        closeCompetitor: {
            name: ahead.displayName,
            stepsBehind: (ahead.value ?? 0) - selfSteps,
            position: ahead.rank,
        },
    };
}
export async function checkGoalAchievements(userId) {
    const user = await getUserById(userId);
    if (!user)
        return [];
    const today = todayUtc();
    const dailyGoal = user.dailyStepGoal ?? 8000;
    const stepHistory = await getStepsByDate(userId, today);
    if (!stepHistory || stepHistory.stepCount < dailyGoal)
        return [];
    if (stepHistory.goalAchieved)
        return [];
    const achievements = [
        {
            type: 'daily_goal',
            goalType: 'Daily Step Goal',
            value: stepHistory.stepCount,
            target: dailyGoal,
        },
    ];
    await markGoalAchieved(userId, today);
    return achievements;
}
export async function calculateGoalStreakDays(userId, dailyGoal) {
    let streak = 0;
    let cursor = todayUtc();
    for (let i = 0; i < 365; i++) {
        const row = await getStepsByDate(userId, cursor);
        if (row && row.stepCount >= dailyGoal) {
            streak += 1;
            cursor = addDaysUtc(cursor, -1);
        }
        else {
            break;
        }
    }
    return streak;
}
export async function updateUserLastMotivation(userId) {
    await updateUser(userId, { lastMotivationEmail: new Date().toISOString() });
}
export function displayNameForEmail(user) {
    return getDisplayName(user) || user.username || user.email;
}
export function fitnessUserPayload(user) {
    return {
        name: displayNameForEmail(user),
        email: user.email,
    };
}
