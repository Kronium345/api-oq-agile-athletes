import dayjs from 'dayjs';
import transporter, { accountEmail, isEmailConfigured } from '../config/nodemailer.ts';
import { emailTemplates, type EmailTemplateLabel } from './email-template.ts';

function frontendBase(): string {
  let url = (process.env.FRONTEND_URL || 'https://api-oq-agile-athletes.onrender.com')
    .trim()
    .replace(/\/$/, '');
  if (url && !/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

export interface FitnessEmailData {
  user?: { name?: string; email?: string };
  currentSteps?: number;
  dailyGoal?: number;
  streakDays?: number;
  weeklyProgress?: number;
  weeklySteps?: number;
  friendName?: string;
  stepsBehind?: number;
  workoutTitle?: string;
  commenterName?: string;
  runName?: string;
  runLocation?: string;
  runDate?: string | Date | null;
  goalType?: string;
  directionsLink?: string | null;
  [key: string]: unknown;
}

export async function sendFitnessReminderEmail({
  to,
  type,
  fitnessData,
}: {
  to: string;
  type: EmailTemplateLabel;
  fitnessData: FitnessEmailData;
}) {
  if (!to || !type) throw new Error('Missing required parameters');
  if (!isEmailConfigured()) {
    console.warn(`[email] skipped ${type} — email not configured`);
    return { success: false, skipped: true };
  }

  const template = emailTemplates.find((t) => t.label === type);
  if (!template) throw new Error(`Template for type ${type} not found`);

  const base = frontendBase();
  const mailInfo = {
    userName: fitnessData.user?.name || 'Fitness Enthusiast',
    currentSteps: fitnessData.currentSteps ?? 0,
    dailyGoal: fitnessData.dailyGoal ?? 8000,
    streakDays: fitnessData.streakDays ?? 0,
    weeklyProgress: fitnessData.weeklyProgress ?? 0,
    weeklySteps: fitnessData.weeklySteps ?? 0,
    appLink: base,
    settingsLink: `${base}/settings/notifications`,
    supportLink: `${base}/support`,
    unsubscribeLink: `${base}/unsubscribe?email=${encodeURIComponent(to)}`,
    ...fitnessData,
  } as FitnessEmailData & {
    userName: string;
    appLink: string;
    settingsLink: string;
    supportLink: string;
    unsubscribeLink: string;
    progressPercentage?: number;
    stepsRemaining?: number;
  };

  if (mailInfo.runDate) {
    mailInfo.runDate = dayjs(mailInfo.runDate).format('MMMM DD, YYYY at h:mm A') as string;
  }

  if (mailInfo.currentSteps != null && mailInfo.dailyGoal) {
    mailInfo.progressPercentage = Math.round((mailInfo.currentSteps / mailInfo.dailyGoal) * 100);
    mailInfo.stepsRemaining = Math.max(0, mailInfo.dailyGoal - mailInfo.currentSteps);
  }

  const html = template.generateBody(mailInfo as never);
  const subject = template.generateSubject(mailInfo as never);

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || accountEmail,
    to,
    subject,
    html,
  });

  console.log(`[email] sent ${type} → ${to}`);
  return { success: true, messageId: info.messageId };
}

export const sendDailyGoalReminderEmail = (to: string, data: FitnessEmailData) =>
  sendFitnessReminderEmail({ to, type: 'Daily step goal reminder', fitnessData: data });

export const sendLeaderboardAlertEmail = (to: string, data: FitnessEmailData) =>
  sendFitnessReminderEmail({ to, type: 'Leaderboard alert', fitnessData: data });

export const sendWeeklyProgressEmail = (to: string, data: FitnessEmailData) =>
  sendFitnessReminderEmail({ to, type: 'Weekly progress summary', fitnessData: data });

export const sendMotivationEmail = (to: string, data: FitnessEmailData) =>
  sendFitnessReminderEmail({ to, type: 'Motivation boost', fitnessData: data });

export const sendGoalAchievementEmail = (to: string, data: FitnessEmailData) =>
  sendFitnessReminderEmail({ to, type: 'Goal achievement', fitnessData: data });

export const sendStreakMilestoneEmail = (to: string, data: FitnessEmailData) =>
  sendFitnessReminderEmail({ to, type: 'Streak milestone', fitnessData: data });

export async function sendPasswordResetEmail(to: string, resetCode: string): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error('Email service not configured');
  }

  const appName = process.env.ACCOUNT_DELETION_APP_NAME || 'OQ Agile Athletes';
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || accountEmail,
    to,
    subject: `Password Reset Code - ${appName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Your reset code (expires in 15 minutes):</p>
        <div style="background:#f4f4f4;padding:15px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:5px;">
          ${resetCode}
        </div>
        <p>If you didn't request this, ignore this email.</p>
      </div>`,
  });
}
