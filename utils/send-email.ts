import dayjs from 'dayjs';
import transporter, { accountEmail, isEmailConfigured } from '../config/nodemailer.ts';
import { emailTemplates, type EmailTemplateLabel } from './email-template.ts';

export function appDisplayName(): string {
  return (
    process.env.APP_DISPLAY_NAME?.trim() ||
    process.env.ACCOUNT_DELETION_APP_NAME?.trim() ||
    'OQ Agile Athletes'
  );
}

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

function buildWelcomeEmailHtml(userName: string, appLink: string): string {
  const appName = appDisplayName();
  const safeName = userName.replace(/[<>&]/g, '');
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background-color: #f0f8f0;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 15px; overflow: hidden; box-shadow: 0 6px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); text-align: center; padding: 28px;">
            <h1 style="color: white; font-size: 28px; margin: 0;">Welcome to ${appName}</h1>
            <p style="color: rgba(255,255,255,0.9); font-size: 15px; margin: 10px 0 0;">Your fitness journey starts here</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px 28px;">
            <p style="font-size: 17px; margin: 0 0 16px;">Hi <strong style="color: #2E7D32;">${safeName}</strong>,</p>
            <p style="margin: 0 0 16px;">Thanks for joining us — we're glad you're here. Finish setting up your profile in the app, then explore what ${appName} can do for you:</p>
            <ul style="margin: 0 0 20px; padding-left: 20px; color: #444;">
              <li><strong>Steps &amp; goals</strong> — track daily movement, streaks, and progress</li>
              <li><strong>Leaderboards</strong> — stay motivated with friends</li>
              <li><strong>Food scan</strong> — log meals and nutrition from photos</li>
              <li><strong>Workouts &amp; Mind Center</strong> — training and mental wellness in one place</li>
            </ul>
            <p style="margin: 0 0 24px; font-size: 15px; color: #555;">We'll send occasional reminders and summaries if you keep notifications on — you can change that anytime in settings.</p>
            <p style="text-align: center; margin: 0;">
              <a href="${appLink}" style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 25px; font-weight: 600; display: inline-block;">Open the app</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 28px 28px; font-size: 14px; color: #666;">
            <p style="margin: 0;">Stay strong,<br><strong style="color: #2E7D32;">The ${appName} team</strong></p>
          </td>
        </tr>
      </table>
    </div>`;
}

/** Sent once after register/signup. Does not throw when email is unconfigured. */
export async function sendWelcomeEmail(
  to: string,
  userName: string
): Promise<{ success: boolean; skipped?: boolean; messageId?: string }> {
  if (!to?.trim()) return { success: false, skipped: true };
  if (!isEmailConfigured()) {
    console.warn('[email] skipped welcome — email not configured');
    return { success: false, skipped: true };
  }

  const appName = appDisplayName();
  const appLink = frontendBase();
  const displayName = userName?.trim() || 'there';

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || accountEmail,
    to: to.trim(),
    subject: `Welcome to ${appName} — let's get moving`,
    html: buildWelcomeEmailHtml(displayName, appLink),
  });

  console.log(`[email] sent welcome → ${to}`);
  return { success: true, messageId: info.messageId };
}

export async function sendPasswordResetEmail(to: string, resetCode: string): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error('Email service not configured');
  }

  const appName = appDisplayName();
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
