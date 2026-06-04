export interface EmailNotificationPrefs {
  stepReminders: boolean;
  weeklyProgress: boolean;
  leaderboardAlerts: boolean;
  motivation: boolean;
  runReminders: boolean;
  workoutDiscussions: boolean;
}

export const DEFAULT_EMAIL_NOTIFICATIONS: EmailNotificationPrefs = {
  stepReminders: true,
  weeklyProgress: true,
  leaderboardAlerts: true,
  motivation: true,
  runReminders: true,
  workoutDiscussions: true,
};

export function resolveEmailNotifications(user: {
  emailSubscription?: boolean;
  emailNotifications?: Partial<EmailNotificationPrefs>;
}): EmailNotificationPrefs {
  if (user.emailSubscription === false) {
    return {
      stepReminders: false,
      weeklyProgress: false,
      leaderboardAlerts: false,
      motivation: false,
      runReminders: false,
      workoutDiscussions: false,
    };
  }

  return {
    ...DEFAULT_EMAIL_NOTIFICATIONS,
    ...user.emailNotifications,
  };
}

/** Map mobile AsyncStorage keys → stored prefs */
export function prefsFromMobileSettings(settings: {
  emailSubscription?: boolean;
  stepStreakReminders?: boolean;
  leaderboardAlerts?: boolean;
  runReminders?: boolean;
  workoutDiscussions?: boolean;
}): {
  emailSubscription: boolean;
  emailNotifications: EmailNotificationPrefs;
} {
  const subscribed = settings.emailSubscription !== false;
  return {
    emailSubscription: subscribed,
    emailNotifications: {
      ...DEFAULT_EMAIL_NOTIFICATIONS,
      stepReminders: settings.stepStreakReminders !== false,
      leaderboardAlerts: settings.leaderboardAlerts !== false,
      runReminders: settings.runReminders !== false,
      workoutDiscussions: settings.workoutDiscussions !== false,
      weeklyProgress: subscribed,
      motivation: subscribed,
    },
  };
}
