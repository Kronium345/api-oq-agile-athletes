import { getActivityData } from '../models/activity.ts';
import { getTotalSteps } from '../models/stepHistory.ts';
import { getUserById } from '../models/user.ts';
import { getUserStats } from '../models/userStats.ts';
import { getDisplayName } from './userDisplay.ts';

export type UserCoachContext = {
  displayName?: string;
  gender?: string;
  experience?: string;
  weight?: number;
  unit?: string;
  stats?: {
    totalWorkouts?: number;
    totalCalories?: number;
    totalMinutes?: number;
  };
  totalSteps?: number;
  activeDaysThisMonth?: number;
};

function monthStartUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t || undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function countActiveDaysThisMonth(userId: string): Promise<number | undefined> {
  try {
    const activities = await getActivityData(userId, monthStartUtc(), todayUtc());
    if (!activities.length) return undefined;
    return new Set(activities.map((a) => a.date)).size;
  } catch {
    return undefined;
  }
}

export async function buildUserCoachContext(userId: string): Promise<UserCoachContext> {
  const [user, stats, totalSteps, activeDaysThisMonth] = await Promise.all([
    getUserById(userId),
    getUserStats(userId),
    getTotalSteps(userId),
    countActiveDaysThisMonth(userId),
  ]);

  if (!user) {
    return {};
  }

  const ctx: UserCoachContext = {};

  const displayName = getDisplayName(user);
  if (displayName && displayName !== 'User') {
    ctx.displayName = displayName;
  }

  const gender = pickString(user.gender);
  if (gender) ctx.gender = gender;

  const experience = pickString(user.experience);
  if (experience) ctx.experience = experience;

  const weight = pickNumber(user.weight);
  if (weight != null) ctx.weight = weight;

  const unit = pickString(user.unit);
  if (unit) ctx.unit = unit;

  const statBlock: UserCoachContext['stats'] = {};
  if (stats.totalWorkouts > 0) statBlock.totalWorkouts = stats.totalWorkouts;
  if (stats.totalCalories > 0) statBlock.totalCalories = stats.totalCalories;
  if (stats.totalMinutes > 0) statBlock.totalMinutes = stats.totalMinutes;
  if (Object.keys(statBlock).length > 0) ctx.stats = statBlock;

  if (totalSteps > 0) ctx.totalSteps = totalSteps;
  if (activeDaysThisMonth != null && activeDaysThisMonth > 0) {
    ctx.activeDaysThisMonth = activeDaysThisMonth;
  }

  return ctx;
}

export function formatCoachContextForPrompt(ctx: UserCoachContext): string {
  const lines: string[] = [
    'USER PROFILE (use for personalization; do not invent missing data):',
  ];

  if (ctx.displayName) lines.push(`- Name: ${ctx.displayName}`);
  if (ctx.experience) lines.push(`- Experience: ${ctx.experience}`);
  if (ctx.weight != null) {
    const unit = ctx.unit || 'kg';
    lines.push(`- Weight: ${ctx.weight} ${unit}`);
  }
  if (ctx.gender) lines.push(`- Gender: ${ctx.gender}`);
  if (ctx.stats?.totalWorkouts != null) {
    lines.push(`- Total workouts logged: ${ctx.stats.totalWorkouts}`);
  }
  if (ctx.stats?.totalMinutes != null) {
    lines.push(`- Total training minutes: ${ctx.stats.totalMinutes}`);
  }
  if (ctx.stats?.totalCalories != null) {
    lines.push(`- Total calories (app estimate): ${ctx.stats.totalCalories}`);
  }
  if (ctx.totalSteps != null) {
    lines.push(`- Total steps tracked: ${ctx.totalSteps.toLocaleString()}`);
  }
  if (ctx.activeDaysThisMonth != null) {
    lines.push(`- Active days this calendar month: ${ctx.activeDaysThisMonth}`);
  }

  if (lines.length === 1) {
    lines.push('- (No profile or activity stats on file yet.)');
  }

  lines.push(
    '',
    'If a field is missing, give general advice and say you do not have that detail yet.',
    'Do not give medical diagnosis. This is fitness coaching only.'
  );

  return lines.join('\n');
}

export function buildCoachAugmentedPrompt(originalPrompt: string, ctx: UserCoachContext): string {
  const prefix = formatCoachContextForPrompt(ctx);
  const trimmed = originalPrompt.trim();
  return trimmed ? `${prefix}\n\n${trimmed}` : prefix;
}
