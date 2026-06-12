import { isShareStepsEnabled } from "./userDisplay.js";
export function toClientUser(user) {
    const displayName = user.name ||
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        user.email;
    return {
        ...user,
        _id: user.userId,
        name: displayName,
        shareStepsEnabled: isShareStepsEnabled(user),
    };
}
export const EXPERIENCE_LEVELS = [
    'Beginner',
    'Intermediate',
    'Advanced',
    'Pro',
    'Elite',
];
export const GENDER_VALUES = ['Male', 'Female'];
export function isValidExperience(value) {
    return EXPERIENCE_LEVELS.includes(value);
}
export function isValidGender(value) {
    return GENDER_VALUES.includes(value);
}
