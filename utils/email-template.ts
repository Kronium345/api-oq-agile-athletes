export interface EmailTemplateData {
  userName: string;
  currentSteps?: number;
  dailyGoal?: number;
  streakDays?: number;
  weeklyProgress?: number;
  weeklySteps?: number;
  leaderboardPosition?: number | null;
  friendName?: string;
  stepsBehind?: number;
  workoutTitle?: string;
  commenterName?: string;
  runName?: string;
  runLocation?: string;
  runDate?: string | null;
  goalType?: string;
  appLink: string;
  settingsLink: string;
  supportLink: string;
  unsubscribeLink: string;
  directionsLink?: string | null;
  progressPercentage?: number;
  stepsRemaining?: number;
}

export const generateFitnessEmailTemplate = (data: EmailTemplateData): string => `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f0f8f0;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 15px; overflow: hidden; box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);">
            <tr>
                <td style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); text-align: center; padding: 30px;">
                    <h1 style="color: white; font-size: 32px; margin: 0; font-weight: 700;">🏃‍♀️ City Fit</h1>
                    <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 10px 0 0 0;">Your Fitness Journey Continues</p>
                </td>
            </tr>
            <tr>
                <td style="padding: 40px 30px;">
                    <p style="font-size: 18px; margin-bottom: 25px;">Hello <strong style="color: #4CAF50;">${data.userName}</strong>! 💪</p>
                    ${
                      data.currentSteps != null
                        ? `
                    <div style="background: linear-gradient(135deg, #E8F5E8 0%, #F1F8E9 100%); border-radius: 12px; padding: 25px; margin-bottom: 25px; border-left: 4px solid #4CAF50;">
                        <h3 style="color: #2E7D32; margin: 0 0 15px 0; font-size: 18px;">📊 Your Daily Progress</h3>
                        <p style="margin:0;"><strong>${data.currentSteps?.toLocaleString()}</strong> steps today · goal <strong>${data.dailyGoal?.toLocaleString()}</strong> · streak <strong>${data.streakDays ?? 0}</strong> days</p>
                    </div>`
                        : ''
                    }
                    ${
                      data.leaderboardPosition
                        ? `
                    <div style="background: #FFF3E0; border-radius: 12px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #FF6F00;">
                        <p style="margin:0;">🏆 You're currently #${data.leaderboardPosition} on the leaderboard!</p>
                    </div>`
                        : ''
                    }
                </td>
            </tr>
            <tr>
                <td style="padding: 0 30px 40px 30px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <a href="${data.appLink}" style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 25px; font-weight: 600; display: inline-block;">📱 Open City Fit App</a>
                    </div>
                    <p style="font-size: 14px; color: #666;">
                        <a href="${data.settingsLink}" style="color: #4CAF50;">Notification Settings</a> |
                        <a href="${data.supportLink}" style="color: #4CAF50;">Support</a> |
                        <a href="${data.unsubscribeLink}" style="color: #4CAF50;">Unsubscribe</a>
                    </p>
                    <p style="font-size: 16px; margin-top: 30px; color: #2E7D32;">Stay Strong! 💚<br><strong>The City Fit Team</strong></p>
                </td>
            </tr>
        </table>
    </div>`;

export const generateSimpleTemplate = (data: {
  userName: string;
  message: string;
  ctaText?: string;
  ctaLink?: string;
  appLink: string;
}): string => `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f8f0;">
        <div style="background: #fff; border-radius: 15px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%); text-align: center; padding: 20px;">
                <h1 style="color: white; font-size: 24px; margin: 0;">🏃‍♀️ City Fit</h1>
            </div>
            <div style="padding: 30px;">
                <p>Hi <strong style="color: #4CAF50;">${data.userName}</strong>!</p>
                <p>${data.message}</p>
                ${
                  data.ctaText && data.ctaLink
                    ? `<p style="text-align:center;margin:24px 0;"><a href="${data.ctaLink}" style="background:#4CAF50;color:#fff;padding:12px 24px;border-radius:20px;text-decoration:none;font-weight:600;">${data.ctaText}</a></p>`
                    : ''
                }
                <p style="text-align:center;"><a href="${data.appLink}" style="color:#4CAF50;">📱 Open City Fit App</a></p>
            </div>
        </div>
    </div>`;

export type EmailTemplateLabel =
  | 'Step streak reminder'
  | 'Daily step goal reminder'
  | 'Leaderboard alert'
  | 'Community run reminder'
  | 'Workout discussion'
  | 'Weekly progress summary'
  | 'Motivation boost'
  | 'Rest day reminder'
  | 'Goal achievement'
  | 'Streak milestone';

export const emailTemplates: Array<{
  label: EmailTemplateLabel;
  generateSubject: (data: EmailTemplateData) => string;
  generateBody: (data: EmailTemplateData) => string;
}> = [
  {
    label: 'Step streak reminder',
    generateSubject: (d) =>
      `🚶‍♀️ Don't break your ${d.streakDays}-day streak! Only ${Math.max(0, (d.dailyGoal ?? 0) - (d.currentSteps ?? 0))} steps to go!`,
    generateBody: (d) =>
      generateFitnessEmailTemplate({ ...d, appLink: `${d.appLink}/(drawer)/(tabs)/stepCounter` }),
  },
  {
    label: 'Daily step goal reminder',
    generateSubject: (d) =>
      `⏰ Evening reminder: ${d.stepsRemaining ?? 0} steps left to reach your goal!`,
    generateBody: (d) =>
      generateFitnessEmailTemplate({ ...d, appLink: `${d.appLink}/(drawer)/(tabs)/stepCounter` }),
  },
  {
    label: 'Leaderboard alert',
    generateSubject: (d) =>
      `🏆 ${d.friendName} is only ${d.stepsBehind} steps ahead! Time to catch up!`,
    generateBody: (d) =>
      generateSimpleTemplate({
        userName: d.userName,
        message: `Your friend <strong>${d.friendName}</strong> is ahead by <strong>${d.stepsBehind} steps</strong>. A quick walk could put you back on top! 🏃‍♀️`,
        ctaText: '📊 Check Leaderboard',
        ctaLink: `${d.appLink}/stepLeaderboard`,
        appLink: d.appLink,
      }),
  },
  {
    label: 'Community run reminder',
    generateSubject: (d) =>
      `🏃‍♀️ Reminder: "${d.runName}" starts soon at ${d.runLocation}!`,
    generateBody: (d) =>
      generateSimpleTemplate({
        userName: d.userName,
        message: `Don't forget! "<strong>${d.runName}</strong>" at <strong>${d.runLocation}</strong>.`,
        ctaText: '🗺️ Get Directions',
        ctaLink: d.directionsLink || d.appLink,
        appLink: d.appLink,
      }),
  },
  {
    label: 'Workout discussion',
    generateSubject: (d) => `💬 New comment on "${d.workoutTitle}" from ${d.commenterName}`,
    generateBody: (d) =>
      generateSimpleTemplate({
        userName: d.userName,
        message: `<strong>${d.commenterName}</strong> commented on "<strong>${d.workoutTitle}</strong>".`,
        ctaText: '💬 View Discussion',
        ctaLink: `${d.appLink}/(drawer)/workout`,
        appLink: d.appLink,
      }),
  },
  {
    label: 'Weekly progress summary',
    generateSubject: (d) =>
      `📊 Your weekly summary: ${(d.weeklySteps ?? 0).toLocaleString()} steps!`,
    generateBody: (d) =>
      generateFitnessEmailTemplate({ ...d, appLink: `${d.appLink}/(drawer)/(tabs)/stepCounter` }),
  },
  {
    label: 'Motivation boost',
    generateSubject: () => `💪 You're doing amazing! Keep up the momentum!`,
    generateBody: (d) =>
      generateSimpleTemplate({
        userName: d.userName,
        message:
          'Every step and every healthy choice matters. You are building habits that last! 🌟',
        ctaText: '📈 View Progress',
        ctaLink: `${d.appLink}/(drawer)/(tabs)/stepCounter`,
        appLink: d.appLink,
      }),
  },
  {
    label: 'Rest day reminder',
    generateSubject: () => `😴 Time to rest and recover — you've earned it!`,
    generateBody: (d) =>
      generateSimpleTemplate({
        userName: d.userName,
        message: 'Recovery is part of progress. Rest, stretch, and rebuild stronger. 🧘‍♀️',
        ctaText: '🧘‍♀️ Mind Center',
        ctaLink: `${d.appLink}/(drawer)/mental`,
        appLink: d.appLink,
      }),
  },
  {
    label: 'Goal achievement',
    generateSubject: (d) => `🎉 Congratulations! You've reached your ${d.goalType} goal!`,
    generateBody: (d) =>
      generateSimpleTemplate({
        userName: d.userName,
        message: `You've achieved your <strong>${d.goalType}</strong> goal. Time to celebrate! 🎯`,
        ctaText: '🎯 Set New Goal',
        ctaLink: `${d.appLink}/(drawer)/(tabs)/profileScreen`,
        appLink: d.appLink,
      }),
  },
  {
    label: 'Streak milestone',
    generateSubject: (d) => `🔥 Incredible! ${d.streakDays}-day streak achieved!`,
    generateBody: (d) =>
      generateSimpleTemplate({
        userName: d.userName,
        message: `You've hit <strong>${d.streakDays} consecutive days</strong> toward your step goal! 🔥`,
        ctaText: '📊 View Stats',
        ctaLink: `${d.appLink}/(drawer)/(tabs)/stepCounter`,
        appLink: d.appLink,
      }),
  },
];
