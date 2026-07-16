import type { PerformanceCheckin } from '../models/performanceCheckin.ts';
import {
  getPerformanceCheckinByDate,
  listPerformanceCheckins,
  listPerformanceCheckinsInRange,
  upsertPerformanceCheckin,
} from '../models/performanceCheckin.ts';
import { getStepsByDate } from '../models/stepHistory.ts';
import { getUserById } from '../models/user.ts';
import { computeRecoveryScore, type CheckInInputs } from './performanceScoring.ts';
import {
  computeTrainingLoadBand,
  fetchDailyLoads,
  resolveTrainingLoad,
} from './performanceTrainingLoad.ts';
import {
  getBreathingSessionsInWeek,
  getSuggestedBreathingForToday,
} from './recoveryHub.ts';
import { addDaysUtc, todayUtc, weekStartMondayUtc } from '../utils/stepDates.ts';

function defaultDailyStepGoal(user: { dailyStepGoal?: number } | null): number {
  const envDefault = Number(process.env.DEFAULT_DAILY_STEP_GOAL);
  const fallback = Number.isFinite(envDefault) && envDefault > 0 ? envDefault : 10000;
  const userGoal = user?.dailyStepGoal;
  return typeof userGoal === 'number' && userGoal > 0 ? userGoal : fallback;
}

export function toPerformanceDashboard(doc: PerformanceCheckin) {
  return {
    date: doc.date,
    recoveryScore: doc.recoveryScore,
    sleepScore: doc.sleepScore,
    stressScore: doc.stressScore,
    energyScore: doc.energyScore,
    trainingLoad: doc.trainingLoad,
    recommendations: doc.recommendations,
    sleepHours: doc.sleepHours,
    sleepQuality: doc.sleepQuality,
    stress: doc.stress,
    energy: doc.energy,
    muscleSoreness: doc.muscleSoreness,
    proteinIntake: doc.proteinIntake,
    waterIntakeLiters: doc.waterIntakeLiters,
    alcohol: doc.alcohol,
  };
}

async function todayStepsForUser(userId: string, date: string): Promise<number> {
  const row = await getStepsByDate(userId, date);
  return row?.stepCount ?? 0;
}

export async function submitPerformanceCheckIn(
  userId: string,
  payload: CheckInInputs & { date: string }
) {
  const user = await getUserById(userId);
  const dailyStepGoal = defaultDailyStepGoal(user);
  const todaySteps = await todayStepsForUser(userId, payload.date);
  const trainingLoad = await resolveTrainingLoad(userId, payload.date);

  const computed = computeRecoveryScore({
    inputs: payload,
    todaySteps,
    dailyStepGoal,
    trainingLoad,
  });

  const saved = await upsertPerformanceCheckin({
    userId,
    date: payload.date,
    sleepHours: payload.sleepHours,
    sleepQuality: payload.sleepQuality,
    stress: payload.stress,
    energy: payload.energy,
    muscleSoreness: payload.muscleSoreness,
    proteinIntake: payload.proteinIntake,
    waterIntakeLiters: payload.waterIntakeLiters,
    alcohol: payload.alcohol,
    recoveryScore: computed.recoveryScore,
    sleepScore: computed.sleepScore,
    stressScore: computed.stressScore,
    energyScore: computed.energyScore,
    trainingLoad: computed.trainingLoad,
    recommendations: computed.recommendations,
  });

  return toPerformanceDashboard(saved);
}

export async function getPerformanceToday(userId: string, date: string) {
  const breathing = await getSuggestedBreathingForToday(userId, date);

  const row = await getPerformanceCheckinByDate(userId, date);
  if (!row) {
    const dailyLoads = await fetchDailyLoads(userId, date, 28);
    const { band } = computeTrainingLoadBand(dailyLoads, date);
    return {
      date,
      hasCheckIn: false as const,
      trainingLoad: band,
      breathingSessionsToday: breathing.breathingSessionsToday,
      suggestedBreathingProtocolId: breathing.suggestedBreathingProtocolId,
      suggestedNextAction: breathing.suggestedNextAction,
    };
  }

  return {
    ...toPerformanceDashboard(row),
    hasCheckIn: true as const,
    breathingSessionsToday: breathing.breathingSessionsToday,
    suggestedBreathingProtocolId: breathing.suggestedBreathingProtocolId,
    suggestedNextAction: breathing.suggestedNextAction,
  };
}

export async function getPerformanceCheckInHistory(
  userId: string,
  options: { limit?: number; startDate?: string; endDate?: string }
) {
  const rows = await listPerformanceCheckins(userId, options);
  return rows.map(toPerformanceDashboard);
}

export async function getPerformanceTrends(userId: string, period: 30 | 90) {
  const endDate = todayUtc();
  const startDate = addDaysUtc(endDate, -(period - 1));
  const rows = await listPerformanceCheckinsInRange(userId, startDate, endDate);

  const count = rows.length || 1;
  const sum = rows.reduce(
    (acc, row) => {
      acc.recoveryScore += row.recoveryScore;
      acc.sleepScore += row.sleepScore;
      acc.stressScore += row.stressScore;
      acc.energyScore += row.energyScore;
      return acc;
    },
    { recoveryScore: 0, sleepScore: 0, stressScore: 0, energyScore: 0 }
  );

  const trainingLoadSummary: Record<string, number> = {
    Normal: 0,
    Building: 0,
    High: 0,
    'Very High': 0,
  };
  for (const row of rows) {
    trainingLoadSummary[row.trainingLoad] = (trainingLoadSummary[row.trainingLoad] ?? 0) + 1;
  }

  return {
    period,
    startDate,
    endDate,
    averages: {
      recoveryScore: Math.round(sum.recoveryScore / count),
      sleepScore: Math.round(sum.sleepScore / count),
      stressScore: Math.round(sum.stressScore / count),
      energyScore: Math.round(sum.energyScore / count),
    },
    series: rows.map((row) => ({
      date: row.date,
      recoveryScore: row.recoveryScore,
      sleepScore: row.sleepScore,
      stressScore: row.stressScore,
      energyScore: row.energyScore,
      trainingLoad: row.trainingLoad,
    })),
    trainingLoadSummary,
    checkInCount: rows.length,
  };
}

function dominantTrainingLoad(summary: Record<string, number>): string {
  let best = 'Normal';
  let bestCount = -1;
  for (const [band, count] of Object.entries(summary)) {
    if (count > bestCount) {
      best = band;
      bestCount = count;
    }
  }
  return best;
}

export async function getPerformanceWeeklySummary(userId: string, weekStart: string) {
  const weekEnd = addDaysUtc(weekStart, 6);
  const rows = await listPerformanceCheckinsInRange(userId, weekStart, weekEnd);
  const breathingSessionsWeek = await getBreathingSessionsInWeek(userId, weekStart);

  const trainingLoadSummary: Record<string, number> = {
    Normal: 0,
    Building: 0,
    High: 0,
    'Very High': 0,
  };

  const breathingLine =
    breathingSessionsWeek > 0
      ? ` You completed ${breathingSessionsWeek} recovery breathing session${breathingSessionsWeek === 1 ? '' : 's'} this week.`
      : '';

  if (!rows.length) {
    return {
      weekStart,
      weekEnd,
      checkInCount: 0,
      averages: {
        recoveryScore: 0,
        sleepScore: 0,
        stressScore: 0,
        energyScore: 0,
      },
      dominantTrainingLoad: 'Normal',
      breathingSessionsWeek,
      narrative:
        `No check-ins recorded this week. Log daily readiness to unlock recovery insights.${breathingLine}`.trim(),
    };
  }

  const sum = rows.reduce(
    (acc, row) => {
      acc.recoveryScore += row.recoveryScore;
      acc.sleepScore += row.sleepScore;
      acc.stressScore += row.stressScore;
      acc.energyScore += row.energyScore;
      trainingLoadSummary[row.trainingLoad] = (trainingLoadSummary[row.trainingLoad] ?? 0) + 1;
      return acc;
    },
    { recoveryScore: 0, sleepScore: 0, stressScore: 0, energyScore: 0 }
  );

  const count = rows.length;
  const averages = {
    recoveryScore: Math.round(sum.recoveryScore / count),
    sleepScore: Math.round(sum.sleepScore / count),
    stressScore: Math.round(sum.stressScore / count),
    energyScore: Math.round(sum.energyScore / count),
  };

  const dominant = dominantTrainingLoad(trainingLoadSummary);

  const narrative = `You logged ${count} readiness check-in${count === 1 ? '' : 's'} this week with an average recovery score of ${averages.recoveryScore}. Training load was mostly ${dominant}. ${averages.sleepScore < 70 ? 'Sleep scores suggest prioritising rest.' : 'Sleep and recovery trends look steady — keep balancing load with rest.'}${breathingLine}`;

  return {
    weekStart,
    weekEnd,
    checkInCount: count,
    averages,
    dominantTrainingLoad: dominant,
    trainingLoadSummary,
    breathingSessionsWeek,
    narrative,
  };
}

export function resolveTrendPeriod(value: unknown): 30 | 90 {
  if (value === '90' || value === 90) return 90;
  return 30;
}

export function resolveWeekStart(dateStr?: string): string {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return weekStartMondayUtc(dateStr);
  }
  return weekStartMondayUtc(todayUtc());
}
