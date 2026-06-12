export function toDailyStepRow(item) {
    return {
        date: item.date,
        stepCount: item.stepCount ?? 0,
    };
}
