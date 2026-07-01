import { getExerciseHistory } from "../models/exerciseHistory.js";
import { getStepHistory } from "../models/stepHistory.js";
import { addDaysUtc, dateRangeInclusive } from "../utils/stepDates.js";
import { computeAcwrRatio, trainingLoadFromRatio, } from "./performanceScoring.js";
export function dailyLoadForDay(workoutMinutes, steps) {
    return workoutMinutes * 1.0 + (steps / 1000) * 0.3;
}
function groupWorkoutMinutesByDate(items) {
    const map = new Map();
    for (const item of items) {
        const date = item.timeStamp.slice(0, 10);
        map.set(date, (map.get(date) ?? 0) + (Number(item.duration) || 0));
    }
    return map;
}
function groupStepsByDate(items) {
    const map = new Map();
    for (const item of items) {
        map.set(item.date, Number(item.stepCount) || 0);
    }
    return map;
}
export async function fetchDailyLoads(userId, anchorDate, lookbackDays = 28) {
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
export function computeTrainingLoadBand(dailyLoads, anchorDate) {
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
export async function resolveTrainingLoad(userId, anchorDate) {
    const dailyLoads = await fetchDailyLoads(userId, anchorDate, 28);
    return computeTrainingLoadBand(dailyLoads, anchorDate).band;
}
