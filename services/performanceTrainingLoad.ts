import { getExerciseHistory } from '../models/exerciseHistory.ts';
import { getStepHistory } from '../models/stepHistory.ts';
import { addDaysUtc, dateRangeInclusive } from '../utils/stepDates.ts';
import {
  computeAcwrRatio,
  trainingLoadFromRatio,
  type TrainingLoadBand,
} from './performanceScoring.ts';

export interface DailyLoadBreakdown {
  date: string;
  workoutMinutes: number;
  steps: number;
  dailyLoad: number;
}

export function dailyLoadForDay(workoutMinutes: number, steps: number): number {
  return workoutMinutes * 1.0 + (steps / 1000) * 0.3;
}

function groupWorkoutMinutesByDate(
  items: Array<{ timeStamp: string; duration?: number }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const date = item.timeStamp.slice(0, 10);
    map.set(date, (map.get(date) ?? 0) + (Number(item.duration) || 0));
  }
  return map;
}

function groupStepsByDate(items: Array<{ date: string; stepCount: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.date, Number(item.stepCount) || 0);
  }
  return map;
}

export async function fetchDailyLoads(
  userId: string,
  anchorDate: string,
  lookbackDays = 28
): Promise<DailyLoadBreakdown[]> {
  const startDate = addDaysUtc(anchorDate, -(lookbackDays - 1));
  const dates = dateRangeInclusive(startDate, anchorDate);

  const [workouts, steps] = await Promise.all([
    getExerciseHistory(userId, startDate, anchorDate),
    getStepHistory(userId, startDate, anchorDate),
  ]);

  const workoutByDate = groupWorkoutMinutesByDate(workouts);
  const stepsByDate = groupStepsByDate(steps);

  return dates.map((date) => {
    const workoutMinutes = workoutByDate.get(date) ?? 0;
    const stepCount = stepsByDate.get(date) ?? 0;
    return {
      date,
      workoutMinutes,
      steps: stepCount,
      dailyLoad: dailyLoadForDay(workoutMinutes, stepCount),
    };
  });
}

export function computeTrainingLoadBand(
  dailyLoads: DailyLoadBreakdown[],
  anchorDate: string
): { band: TrainingLoadBand; acuteLoad: number; chronicLoad: number; ratio: number } {
  const loadByDate = new Map(dailyLoads.map((d) => [d.date, d.dailyLoad]));

  let acuteLoad = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDaysUtc(anchorDate, -i);
    acuteLoad += loadByDate.get(date) ?? 0;
  }

  let chronicSum = 0;
  for (let i = 0; i < 28; i++) {
    const date = addDaysUtc(anchorDate, -i);
    chronicSum += loadByDate.get(date) ?? 0;
  }
  const chronicLoad = chronicSum / 4;

  const ratio = computeAcwrRatio(acuteLoad, chronicLoad);
  const band = trainingLoadFromRatio(ratio);

  return { band, acuteLoad, chronicLoad, ratio };
}

export async function resolveTrainingLoad(
  userId: string,
  anchorDate: string
): Promise<TrainingLoadBand> {
  const dailyLoads = await fetchDailyLoads(userId, anchorDate, 28);
  return computeTrainingLoadBand(dailyLoads, anchorDate).band;
}
