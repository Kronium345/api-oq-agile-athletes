export const DEFAULT_EMAIL_NOTIFICATIONS = {
    stepReminders: true,
    weeklyProgress: true,
    leaderboardAlerts: true,
    motivation: true,
    runReminders: true,
    workoutDiscussions: true,
};
export function resolveEmailNotifications(user) {
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
export function prefsFromMobileSettings(settings) {
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
