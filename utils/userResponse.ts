import type { UserWithoutPassword } from '../models/user.ts';

export function toClientUser(user: UserWithoutPassword) {
  const displayName =
    user.name ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.email;

  return {
    ...user,
    _id: user.userId,
    name: displayName,
  };
}

export const EXPERIENCE_LEVELS = [
  'Beginner',
  'Intermediate',
  'Advanced',
  'Pro',
  'Elite',
] as const;

export const GENDER_VALUES = ['Male', 'Female'] as const;

export function isValidExperience(value: string): boolean {
  return (EXPERIENCE_LEVELS as readonly string[]).includes(value);
}

export function isValidGender(value: string): boolean {
  return (GENDER_VALUES as readonly string[]).includes(value);
}
