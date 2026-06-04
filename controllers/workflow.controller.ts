import dayjs from 'dayjs';
import { createRequire } from 'module';
import {
  sendDailyGoalReminderEmail,
  sendGoalAchievementEmail,
  sendLeaderboardAlertEmail,
  sendMotivationEmail,
  sendStreakMilestoneEmail,
  sendWeeklyProgressEmail,
} from '../utils/send-email.ts';
import {
  STREAK_MILESTONE_DAYS,
  checkGoalAchievements,
  fetchUserForWorkflow,
  fitnessUserPayload,
  getLeaderboardCompetitor,
  getTodayStepData,
  getWeeklyStepData,
  updateUserLastMotivation,
  userWantsEmail,
} from '../services/workflowEmailData.ts';

const require = createRequire(import.meta.url);
const { serve } = require('@upstash/workflow/express') as {
  serve: (fn: (context: WorkflowContext) => Promise<unknown>) => import('express').Router;
};

interface WorkflowContext {
  requestPayload: { userId?: string };
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  sleepUntil: (name: string, date: Date) => Promise<void>;
}

const STEP_REMINDER_HOUR = Number(process.env.WORKFLOW_STEP_REMINDER_HOUR || 20);
const WEEKLY_SUMMARY_DAY = Number(process.env.WORKFLOW_WEEKLY_SUMMARY_DAY || 0);
const MOTIVATION_INTERVAL_DAYS = Number(process.env.WORKFLOW_MOTIVATION_INTERVAL_DAYS || 7);

function requireUserId(context: WorkflowContext): string | null {
  const userId = context.requestPayload?.userId;
  return typeof userId === 'string' && userId.trim() ? userId.trim() : null;
}

export const sendDailyStepReminders = serve(async (context: WorkflowContext) => {
  const userId = requireUserId(context);
  if (!userId) return;

  const user = await context.run('Get user', () => fetchUserForWorkflow(userId));
  if (!user || !userWantsEmail(user, 'stepReminders')) return;

  const stepData = await context.run('Get today step data', () => getTodayStepData(userId));
  const progressPercentage = (stepData.currentSteps / stepData.dailyGoal) * 100;
  const currentHour = dayjs().hour();

  if (currentHour >= STEP_REMINDER_HOUR && progressPercentage < 80) {
    await context.run('Send step reminder', async () => {
      await sendDailyGoalReminderEmail(user.email, {
        user: fitnessUserPayload(user),
        ...stepData,
      });
    });
  }

  if (stepData.streakDays > 0 && STREAK_MILESTONE_DAYS.includes(stepData.streakDays)) {
    await context.run('Send streak milestone', async () => {
      await sendStreakMilestoneEmail(user.email, {
        user: fitnessUserPayload(user),
        streakDays: stepData.streakDays,
        ...stepData,
      });
    });
  }

  const tomorrow = dayjs().add(1, 'day').hour(STEP_REMINDER_HOUR).minute(0).second(0);
  await context.sleepUntil('Next day reminder check', tomorrow.toDate());
});

export const sendWeeklyProgressSummary = serve(async (context: WorkflowContext) => {
  const userId = requireUserId(context);
  if (!userId) return;

  const user = await context.run('Get user', () => fetchUserForWorkflow(userId));
  if (!user || !userWantsEmail(user, 'weeklyProgress')) return;

  const weeklyData = await context.run('Get weekly step data', () => getWeeklyStepData(userId));

  if (weeklyData.totalSteps > 0) {
    await context.run('Send weekly progress', async () => {
      await sendWeeklyProgressEmail(user.email, {
        user: fitnessUserPayload(user),
        ...weeklyData,
      });
    });
  }

  let nextSunday = dayjs().day(WEEKLY_SUMMARY_DAY).hour(9).minute(0).second(0);
  if (nextSunday.isBefore(dayjs())) {
    nextSunday = nextSunday.add(1, 'week');
  }
  await context.sleepUntil('Next weekly summary', nextSunday.toDate());
});

export const sendLeaderboardAlerts = serve(async (context: WorkflowContext) => {
  const userId = requireUserId(context);
  if (!userId) return;

  const user = await context.run('Get user', () => fetchUserForWorkflow(userId));
  if (!user || !userWantsEmail(user, 'leaderboardAlerts')) return;

  const leaderboardData = await context.run('Get leaderboard data', () =>
    getLeaderboardCompetitor(userId)
  );

  if (leaderboardData.closeCompetitor && leaderboardData.closeCompetitor.stepsBehind <= 500) {
    await context.run('Send leaderboard alert', async () => {
      await sendLeaderboardAlertEmail(user.email, {
        user: fitnessUserPayload(user),
        friendName: leaderboardData.closeCompetitor!.name,
        stepsBehind: leaderboardData.closeCompetitor!.stepsBehind,
      });
    });
  }

  let nextCheck = dayjs().hour(19).minute(0).second(0);
  if (nextCheck.isBefore(dayjs())) {
    nextCheck = nextCheck.add(1, 'day');
  }
  await context.sleepUntil('Next leaderboard check', nextCheck.toDate());
});

export const sendMotivationAndGoals = serve(async (context: WorkflowContext) => {
  const userId = requireUserId(context);
  if (!userId) return;

  const user = await context.run('Get user', () => fetchUserForWorkflow(userId));
  if (!user) return;

  const achievements = await context.run('Check goal achievements', () =>
    checkGoalAchievements(userId)
  );

  for (const achievement of achievements) {
    await context.run(`Send goal achievement ${achievement.type}`, async () => {
      await sendGoalAchievementEmail(user.email, {
        user: fitnessUserPayload(user),
        goalType: achievement.goalType,
      });
    });
  }

  if (userWantsEmail(user, 'motivation')) {
    const last = user.lastMotivationEmail ? dayjs(user.lastMotivationEmail) : null;
    const daysSince = last ? dayjs().diff(last, 'day') : MOTIVATION_INTERVAL_DAYS + 1;

    if (daysSince >= MOTIVATION_INTERVAL_DAYS) {
      const stepData = await context.run('Get fitness snapshot', () => getTodayStepData(userId));
      await context.run('Send motivation', async () => {
        await sendMotivationEmail(user.email, {
          user: fitnessUserPayload(user),
          ...stepData,
        });
      });
      await context.run('Update last motivation', () => updateUserLastMotivation(userId));
    }
  }

  const nextCheck = dayjs().add(MOTIVATION_INTERVAL_DAYS, 'day').hour(10).minute(0).second(0);
  await context.sleepUntil('Next motivation check', nextCheck.toDate());
});
