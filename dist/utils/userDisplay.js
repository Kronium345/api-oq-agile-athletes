/** Default true for existing users without the field (backward compatible). */
export const DEFAULT_SHARE_STEPS_ENABLED = true;
export function getDisplayName(user) {
    const name = user.name || user.firstName || user.username;
    if (typeof name === 'string' && name.trim())
        return name.trim();
    return 'User';
}
export function getAvatarLetter(displayName) {
    const letter = displayName.trim().charAt(0).toUpperCase();
    return letter || '?';
}
export function isShareStepsEnabled(user) {
    if (user.shareStepsEnabled === undefined)
        return DEFAULT_SHARE_STEPS_ENABLED;
    return Boolean(user.shareStepsEnabled);
}
export function toPublicUserCard(user) {
    const displayName = getDisplayName(user);
    return {
        userId: user.userId,
        displayName,
        avatarLetter: getAvatarLetter(displayName),
        avatar: typeof user.avatar === 'string' ? user.avatar : null,
    };
}
