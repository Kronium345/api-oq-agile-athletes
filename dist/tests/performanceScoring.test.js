import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRecommendations, clamp, computeAcwrRatio, computeRecoveryScore, computeSleepScore, computeStepsScore, trainingLoadFromRatio, } from "../services/performanceScoring.js";
import { computeTrainingLoadBand, dailyLoadForDay } from "../services/performanceTrainingLoad.js";
import { addDaysUtc } from "../utils/stepDates.js";
const baseInputs = {
    sleepHours: 8,
    sleepQuality: 8,
    stress: 3,
    energy: 8,
    muscleSoreness: 2,
    proteinIntake: 100,
    waterIntakeLiters: 2.5,
    alcohol: false,
};
describe('performanceScoring', () => {
    it('clamps recovery score to 0-100', () => {
        const low = computeRecoveryScore({
            inputs: {
                sleepHours: 0,
                sleepQuality: 1,
                stress: 10,
                energy: 1,
                muscleSoreness: 10,
                alcohol: true,
                proteinIntake: 0,
                waterIntakeLiters: 0,
            },
            todaySteps: 0,
            trainingLoad: 'Very High',
        });
        assert.equal(low.recoveryScore >= 0 && low.recoveryScore <= 100, true);
        const high = computeRecoveryScore({
            inputs: baseInputs,
            todaySteps: 12000,
            trainingLoad: 'Normal',
        });
        assert.equal(high.recoveryScore >= 0 && high.recoveryScore <= 100, true);
        assert.ok(high.recoveryScore > 70);
    });
    it('scores sleep at 8h / quality 8 near target', () => {
        const score = computeSleepScore(8, 8);
        assert.ok(score >= 85 && score <= 100);
    });
    it('caps steps score at 100 when goal exceeded', () => {
        assert.equal(computeStepsScore(15000, 10000), 100);
        assert.equal(computeStepsScore(0, 10000), 0);
    });
    it('maps ACWR ratio to training load bands', () => {
        assert.equal(trainingLoadFromRatio(0.5), 'Building');
        assert.equal(trainingLoadFromRatio(1.0), 'Normal');
        assert.equal(trainingLoadFromRatio(1.4), 'High');
        assert.equal(trainingLoadFromRatio(2.0), 'Very High');
    });
    it('emits sleep recommendation when hours < 7', () => {
        const recs = buildRecommendations({ ...baseInputs, sleepHours: 6 }, 'Normal');
        assert.ok(recs.some((r) => r.type === 'sleep' && r.message.includes('45 minutes')));
    });
    it('emits training warning when load is High', () => {
        const recs = buildRecommendations(baseInputs, 'High');
        assert.ok(recs.some((r) => r.type === 'training' && r.severity === 'warning'));
    });
});
describe('performanceTrainingLoad', () => {
    it('computes daily load from workouts and steps', () => {
        assert.equal(dailyLoadForDay(60, 10000), 60 + 3);
    });
    it('computes acute vs chronic load ratio', () => {
        const anchor = '2026-07-02';
        const dailyLoads = Array.from({ length: 28 }, (_, i) => {
            const date = addDaysUtc(anchor, -(27 - i));
            const load = i >= 21 ? 20 : 5;
            return { date, workoutMinutes: load, steps: 0, dailyLoad: load };
        });
        const result = computeTrainingLoadBand(dailyLoads, anchor);
        assert.ok(result.acuteLoad > result.chronicLoad);
        assert.ok(computeAcwrRatio(result.acuteLoad, result.chronicLoad) > 1);
        assert.equal(clamp(result.ratio, 0, 10), result.ratio);
    });
});
