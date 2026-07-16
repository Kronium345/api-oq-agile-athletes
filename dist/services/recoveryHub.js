import { countCompletedSessionsOnDate, createRecoverySession, getRecoverySessionById, listCompletedSessionsInRange, listRecoverySessions, updateRecoverySession, } from "../models/recoverySession.js";
import { getPerformanceCheckinByDate } from "../models/performanceCheckin.js";
import { getBreathingProtocolById, isKnownProtocolId, listBreathingProtocols, } from "./recoveryProtocols.js";
import { addDaysUtc, todayUtc } from "../utils/stepDates.js";
export function toClientRecoverySession(doc) {
    return {
        id: doc.sessionId,
        protocolId: doc.protocolId,
        status: doc.status,
        startedAt: doc.startedAt,
        completedAt: doc.completedAt ?? null,
        durationSec: doc.durationSec ?? null,
        plannedDurationSec: doc.plannedDurationSec ?? null,
        context: doc.context ?? null,
        athleteMode: doc.athleteMode ?? null,
        moodBefore: doc.moodBefore ?? null,
        moodAfter: doc.moodAfter ?? null,
        stressBefore: doc.stressBefore ?? null,
        stressAfter: doc.stressAfter ?? null,
        device: doc.device ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
export function getRecoveryProtocolsCatalog() {
    return {
        protocols: listBreathingProtocols(),
        disclaimer: 'Guided breathing in Agile Athletes is for general wellness and recovery habits. It is not medical treatment and does not diagnose or treat mental illness.',
    };
}
/**
 * Suggest a protocol without medical framing.
 * Uses optional check-in stress / time-of-day heuristics only.
 */
export function suggestBreathingProtocolId(options) {
    if (options?.completedToday) {
        return 'post_workout_recovery';
    }
    const hour = options?.hourUtc ?? new Date().getUTCHours();
    if (hour >= 20 || hour < 5) {
        return 'sleep_wind_down';
    }
    if (typeof options?.stress === 'number' && options.stress >= 7) {
        return 'stress_reset';
    }
    if (hour >= 5 && hour < 11) {
        return 'pre_workout_focus';
    }
    return 'box_breathing';
}
export async function upsertRecoverySession(userId, input) {
    if (!isKnownProtocolId(input.protocolId)) {
        const err = new Error(`Unknown protocolId: ${input.protocolId}`);
        err.statusCode = 400;
        throw err;
    }
    if (input.sessionId) {
        const existing = await getRecoverySessionById(userId, input.sessionId);
        if (!existing) {
            const err = new Error('Recovery session not found');
            err.statusCode = 404;
            throw err;
        }
        const updated = await updateRecoverySession(userId, input.sessionId, {
            protocolId: input.protocolId,
            status: input.status,
            startedAt: input.startedAt,
            completedAt: input.completedAt ?? null,
            durationSec: input.durationSec ?? null,
            plannedDurationSec: input.plannedDurationSec ?? null,
            context: input.context ?? null,
            athleteMode: input.athleteMode ?? null,
            moodBefore: input.moodBefore ?? null,
            moodAfter: input.moodAfter ?? null,
            stressBefore: input.stressBefore ?? null,
            stressAfter: input.stressAfter ?? null,
            device: input.device ?? null,
        });
        return updated;
    }
    return createRecoverySession({
        userId,
        protocolId: input.protocolId,
        status: input.status,
        startedAt: input.startedAt,
        completedAt: input.completedAt ?? null,
        durationSec: input.durationSec ?? null,
        plannedDurationSec: input.plannedDurationSec ?? null,
        context: input.context ?? null,
        athleteMode: input.athleteMode ?? null,
        moodBefore: input.moodBefore ?? null,
        moodAfter: input.moodAfter ?? null,
        stressBefore: input.stressBefore ?? null,
        stressAfter: input.stressAfter ?? null,
        device: input.device ?? null,
    });
}
export async function getRecoverySessionHistory(userId, options) {
    const sessions = await listRecoverySessions(userId, options);
    return sessions.map(toClientRecoverySession);
}
function utcDayKey(iso) {
    return iso.slice(0, 10);
}
/** Consecutive UTC days ending today with ≥1 completed session. */
export function computeBreathingStreakDays(completedAts, today = todayUtc()) {
    const daysWithSession = new Set(completedAts
        .filter((iso) => typeof iso === 'string' && iso.length >= 10)
        .map((iso) => utcDayKey(iso)));
    let streak = 0;
    let cursor = today;
    while (daysWithSession.has(cursor)) {
        streak += 1;
        cursor = addDaysUtc(cursor, -1);
    }
    return streak;
}
export async function getRecoverySummary(userId, period) {
    const endDate = todayUtc();
    const startDate = addDaysUtc(endDate, -(period - 1));
    const fromIso = `${startDate}T00:00:00.000Z`;
    const toIso = `${endDate}T23:59:59.999Z`;
    const sessions = await listCompletedSessionsInRange(userId, fromIso, toIso);
    const completedCount = sessions.length;
    const protocolCounts = new Map();
    for (const s of sessions) {
        protocolCounts.set(s.protocolId, (protocolCounts.get(s.protocolId) ?? 0) + 1);
    }
    const topProtocols = [...protocolCounts.entries()]
        .map(([protocolId, count]) => ({
        protocolId,
        count,
        name: getBreathingProtocolById(protocolId)?.name,
    }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    const streakDays = computeBreathingStreakDays(sessions.map((s) => s.completedAt || s.startedAt), endDate);
    const completedToday = await countCompletedSessionsOnDate(userId, endDate);
    const checkIn = await getPerformanceCheckinByDate(userId, endDate);
    const suggestedProtocolId = suggestBreathingProtocolId({
        stress: checkIn?.stress ?? null,
        completedToday: completedToday > 0,
    });
    return {
        period,
        from: startDate,
        to: endDate,
        completedCount,
        streakDays,
        breathingSessionsToday: completedToday,
        topProtocols,
        suggestedProtocolId,
        // Habit metric only — not a physiological recovery score.
        note: 'Breathing session counts reflect recovery habits, not measured physiological recovery.',
    };
}
export async function getBreathingSessionsToday(userId, date = todayUtc()) {
    return countCompletedSessionsOnDate(userId, date);
}
export async function getBreathingSessionsInWeek(userId, weekStart) {
    const weekEnd = addDaysUtc(weekStart, 6);
    return (await listCompletedSessionsInRange(userId, `${weekStart}T00:00:00.000Z`, `${weekEnd}T23:59:59.999Z`)).length;
}
export async function getSuggestedBreathingForToday(userId, date = todayUtc()) {
    const [completedToday, checkIn] = await Promise.all([
        countCompletedSessionsOnDate(userId, date),
        getPerformanceCheckinByDate(userId, date),
    ]);
    const suggestedProtocolId = suggestBreathingProtocolId({
        stress: checkIn?.stress ?? null,
        completedToday: completedToday > 0,
    });
    const protocol = getBreathingProtocolById(suggestedProtocolId);
    return {
        breathingSessionsToday: completedToday,
        suggestedBreathingProtocolId: suggestedProtocolId,
        suggestedNextAction: completedToday > 0
            ? undefined
            : `Take a ${Math.round((protocol?.defaultDurationSec ?? 120) / 60)}-minute ${protocol?.name ?? 'breathing'} session.`,
    };
}
