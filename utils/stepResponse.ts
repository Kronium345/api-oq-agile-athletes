import type { StepHistoryItem } from '../models/stepHistory.ts';

export function toDailyStepRow(item: StepHistoryItem) {
  return {
    date: item.date,
    stepCount: item.stepCount ?? 0,
  };
}
