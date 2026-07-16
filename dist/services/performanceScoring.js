const TRAINING_LOAD_SCORES = {
    Normal: 100,
    Building: 85,
    High: 65,
    'Very High': 40,
};
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
export function computeSleepScore(sleepHours, sleepQuality) {
    const sleepHoursScore = clamp((sleepHours / 8) * 100, 0, 100);
    const sleepQualityScore = sleepQuality * 10;
    return sleepHoursScore * 0.55 + sleepQualityScore * 0.45;
}
export function computeStressScore(stress) {
    return (10 - stress) * 10;
}
export function computeEnergyScore(energy) {
    return energy * 10;
}
export function computeSorenessScore(muscleSoreness) {
    return (10 - muscleSoreness) * 10;
}
export function computeStepsScore(todaySteps, dailyGoal = 10000) {
    if (dailyGoal <= 0)
        return 0;
    return clamp(todaySteps / dailyGoal, 0, 1) * 100;
}
export function computeLifestyleScore(inputs) {
    let score = 50;
    if (inputs.proteinIntake != null) {
        if (inputs.proteinIntake >= 80)
            score += 25;
        else
            score -= 10;
    }
    if (inputs.waterIntakeLiters != null) {
        if (inputs.waterIntakeLiters >= 2)
            score += 25;
        else
            score -= 5;
    }
    if (inputs.alcohol === true) {
        score -= 20;
    }
    return clamp(score, 0, 100);
}
export function trainingLoadFromRatio(ratio) {
    if (ratio < 0.8)
        return 'Building';
    if (ratio < 1.3)
        return 'Normal';
    if (ratio < 1.5)
        return 'High';
    return 'Very High';
}
export function trainingLoadScoreForBand(band) {
    return TRAINING_LOAD_SCORES[band];
}
export function computeAcwrRatio(acuteLoad, chronicLoad) {
    return acuteLoad / Math.max(chronicLoad, 1);
}
export function buildRecommendations(inputs, trainingLoad) {
    const recs = [];
    if (inputs.sleepHours < 7) {
        recs.push({
            type: 'sleep',
            severity: 'info',
            message: 'Try going to bed 45 minutes earlier tonight.',
        });
    }
    if (inputs.sleepQuality <= 5) {
        recs.push({
            type: 'sleep',
            severity: 'info',
            message: 'Reduce screen time 1 hour before bed.',
        });
    }
    if (inputs.stress >= 7) {
        recs.push({
            type: 'stress',
            severity: 'warning',
            message: 'Stress looks elevated — a short guided breathing session may help you unwind. This is a wellness habit, not medical treatment.',
            protocolId: 'stress_reset',
            deepLink: '/(drawer)/recovery/breathing?protocol=stress_reset&source=performance_hub',
        });
    }
    if (inputs.energy <= 4) {
        recs.push({
            type: 'lifestyle',
            severity: 'warning',
            message: 'Prioritize recovery; keep intensity moderate.',
        });
    }
    if (inputs.muscleSoreness >= 7) {
        recs.push({
            type: 'training',
            severity: 'warning',
            message: 'High soreness — mobility or rest day.',
        });
    }
    if (inputs.alcohol === true) {
        recs.push({
            type: 'lifestyle',
            severity: 'info',
            message: 'Alcohol can affect recovery — hydrate well.',
        });
    }
    if (inputs.proteinIntake != null && inputs.proteinIntake < 80) {
        recs.push({
            type: 'nutrition',
            severity: 'info',
            message: 'Consider increasing protein for recovery.',
        });
    }
    if (trainingLoad === 'High' || trainingLoad === 'Very High') {
        recs.push({
            type: 'training',
            severity: 'warning',
            message: 'Training load elevated — plan a lighter session.',
        });
    }
    return recs;
}
export function computeRecoveryScore(params) {
    const { inputs, todaySteps, dailyStepGoal = 10000, trainingLoad } = params;
    const sleepScore = Math.round(computeSleepScore(inputs.sleepHours, inputs.sleepQuality));
    const stressScore = Math.round(computeStressScore(inputs.stress));
    const energyScore = Math.round(computeEnergyScore(inputs.energy));
    const sorenessScore = Math.round(computeSorenessScore(inputs.muscleSoreness));
    const stepsScore = Math.round(computeStepsScore(todaySteps, dailyStepGoal));
    const trainingLoadScore = trainingLoadScoreForBand(trainingLoad);
    const lifestyleScore = Math.round(computeLifestyleScore(inputs));
    let recoveryScore = Math.round(sleepScore * 0.25 +
        stressScore * 0.15 +
        energyScore * 0.15 +
        sorenessScore * 0.1 +
        stepsScore * 0.1 +
        trainingLoadScore * 0.1 +
        lifestyleScore * 0.15);
    recoveryScore = clamp(recoveryScore, 0, 100);
    const recommendations = buildRecommendations(inputs, trainingLoad);
    return {
        sleepScore,
        stressScore,
        energyScore,
        sorenessScore,
        stepsScore,
        trainingLoadScore,
        lifestyleScore,
        recoveryScore,
        trainingLoad,
        recommendations,
    };
}
