/** Default true for existing users without the field (backward compatible). */
export const DEFAULT_SHARE_STEPS_ENABLED = true;

export interface UserLike {
  name?: string;
  firstName?: string;
  username?: string;
  avatar?: string;
  shareStepsEnabled?: boolean;
  [key: string]: unknown;
}

export function getDisplayName(user: UserLike): string {
  const name = user.name || user.firstName || user.username;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return 'User';
}

export function getAvatarLetter(displayName: string): string {
  const letter = displayName.trim().charAt(0).toUpperCase();
  return letter || '?';
}

export function isShareStepsEnabled(user: UserLike): boolean {
  if (user.shareStepsEnabled === undefined) return DEFAULT_SHARE_STEPS_ENABLED;
  return Boolean(user.shareStepsEnabled);
}

export function toPublicUserCard(user: UserLike & { userId: string }) {
  const displayName = getDisplayName(user);
  return {
    userId: user.userId,
    displayName,
    avatarLetter: getAvatarLetter(displayName),
    avatar: typeof user.avatar === 'string' ? user.avatar : null,
  };
}
