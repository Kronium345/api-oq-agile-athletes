const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isValidPerformanceDate(date) {
    return DATE_RE.test(date);
}
export function validateCheckInBody(body) {
    const errors = [];
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    if (!isValidPerformanceDate(date)) {
        errors.push({ field: 'date', message: 'date must be YYYY-MM-DD' });
    }
    const sleepHours = Number(body.sleepHours);
    if (Number.isNaN(sleepHours) || sleepHours < 0 || sleepHours > 14) {
        errors.push({ field: 'sleepHours', message: 'sleepHours must be between 0 and 14' });
    }
    const sleepQuality = Number(body.sleepQuality);
    if (Number.isNaN(sleepQuality) || sleepQuality < 1 || sleepQuality > 10) {
        errors.push({ field: 'sleepQuality', message: 'sleepQuality must be between 1 and 10' });
    }
    const stress = Number(body.stress);
    if (Number.isNaN(stress) || stress < 1 || stress > 10) {
        errors.push({ field: 'stress', message: 'stress must be between 1 and 10' });
    }
    const energy = Number(body.energy);
    if (Number.isNaN(energy) || energy < 1 || energy > 10) {
        errors.push({ field: 'energy', message: 'energy must be between 1 and 10' });
    }
    const muscleSoreness = Number(body.muscleSoreness);
    if (Number.isNaN(muscleSoreness) || muscleSoreness < 1 || muscleSoreness > 10) {
        errors.push({ field: 'muscleSoreness', message: 'muscleSoreness must be between 1 and 10' });
    }
    let proteinIntake;
    if (body.proteinIntake !== undefined && body.proteinIntake !== null && body.proteinIntake !== '') {
        proteinIntake = Number(body.proteinIntake);
        if (Number.isNaN(proteinIntake) || proteinIntake < 0) {
            errors.push({ field: 'proteinIntake', message: 'proteinIntake must be a non-negative number' });
        }
    }
    let waterIntakeLiters;
    if (body.waterIntakeLiters !== undefined &&
        body.waterIntakeLiters !== null &&
        body.waterIntakeLiters !== '') {
        waterIntakeLiters = Number(body.waterIntakeLiters);
        if (Number.isNaN(waterIntakeLiters) || waterIntakeLiters < 0) {
            errors.push({ field: 'waterIntakeLiters', message: 'waterIntakeLiters must be a non-negative number' });
        }
    }
    let alcohol;
    if (body.alcohol !== undefined && body.alcohol !== null) {
        if (typeof body.alcohol !== 'boolean') {
            errors.push({ field: 'alcohol', message: 'alcohol must be a boolean' });
        }
        else {
            alcohol = body.alcohol;
        }
    }
    if (errors.length) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        inputs: {
            date,
            sleepHours,
            sleepQuality,
            stress,
            energy,
            muscleSoreness,
            proteinIntake,
            waterIntakeLiters,
            alcohol,
        },
    };
}
