import bcrypt from 'bcryptjs';
import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';
import {
  DEFAULT_EMAIL_NOTIFICATIONS,
  type EmailNotificationPrefs,
} from '../utils/emailNotifications.ts';

const USERS_TABLE = process.env.MONGO_USERS_COLLECTION || 'users';

export interface CreateUserParams {
  name: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}

export interface CreateSocialUserParams {
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  avatar?: string | null;
  authProvider: 'google' | 'apple';
  appleId?: string;
}

export type UserRole = 'member' | 'trainer';

export interface User {
  userId: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  password?: string;
  authProvider?: string;
  appleId?: string | null;
  gender?: string | null;
  experience?: string | null;
  avatar?: string | null;
  weight?: number | null;
  unit?: string;
  roles?: UserRole[];
  gymName?: string;
  postcode?: string;
  location?: { type: 'Point'; coordinates: [number, number] };
  savedTrainerIds?: string[];
  shareStepsEnabled?: boolean;
  dailyStepGoal?: number;
  emailSubscription?: boolean;
  emailNotifications?: EmailNotificationPrefs;
  lastMotivationEmail?: string | null;
  resetCode?: string | null;
  resetCodeExpires?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface UserWithoutPassword {
  userId: string;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  authProvider?: string;
  appleId?: string | null;
  gender?: string | null;
  experience?: string | null;
  avatar?: string | null;
  weight?: number | null;
  unit?: string;
  shareStepsEnabled?: boolean;
  dailyStepGoal?: number;
  emailSubscription?: boolean;
  emailNotifications?: EmailNotificationPrefs;
  lastMotivationEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface AuthResult {
  success: boolean;
  message?: string;
  user?: UserWithoutPassword;
}

export interface UpdateUserParams {
  [key: string]: unknown;
}

function getUsersCollection(): Collection<User> {
  const client = getMongoClient();
  const db = client.db(getMongoDbName());
  return db.collection<User>(USERS_TABLE);
}

function buildDisplayName(params: {
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
}): string {
  if (params.name?.trim()) return params.name.trim();
  const fromParts = [params.firstName, params.lastName].filter(Boolean).join(' ').trim();
  if (fromParts) return fromParts;
  return params.email;
}

async function createUser({
  name,
  email,
  password,
  firstName,
  lastName,
  username,
}: CreateUserParams): Promise<UserWithoutPassword> {
  const usersCollection = getUsersCollection();
  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash(password, 12);
  const createdAt = new Date().toISOString();
  const displayName = buildDisplayName({ name, firstName, lastName, email });

  const user: User = {
    userId,
    email: email.toLowerCase().trim(),
    name: displayName,
    firstName: firstName?.trim() || null,
    lastName: lastName?.trim() || null,
    username: username?.trim() || null,
    password: hashedPassword,
    authProvider: 'local',
    gender: null,
    experience: null,
    avatar: null,
    weight: null,
    unit: 'kg',
    roles: ['member'],
    savedTrainerIds: [],
    shareStepsEnabled: true,
    dailyStepGoal: Number(process.env.DEFAULT_DAILY_STEP_GOAL) || 10000,
    emailSubscription: true,
    emailNotifications: { ...DEFAULT_EMAIL_NOTIFICATIONS },
    lastMotivationEmail: null,
    createdAt,
    updatedAt: createdAt,
  };

  await usersCollection.insertOne(user);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

async function createSocialUser(params: CreateSocialUserParams): Promise<UserWithoutPassword> {
  const usersCollection = getUsersCollection();
  const userId = uuidv4();
  const createdAt = new Date().toISOString();
  const firstName = params.firstName?.trim() || null;
  const lastName = params.lastName?.trim() || null;
  const displayName = buildDisplayName({
    name: params.name,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email: params.email,
  });

  const user: User = {
    userId,
    email: params.email.toLowerCase().trim(),
    name: displayName,
    firstName,
    lastName,
    username: null,
    authProvider: params.authProvider,
    appleId: params.appleId || null,
    gender: null,
    experience: null,
    avatar: params.avatar ?? null,
    weight: null,
    unit: 'kg',
    roles: ['member'],
    savedTrainerIds: [],
    shareStepsEnabled: true,
    dailyStepGoal: Number(process.env.DEFAULT_DAILY_STEP_GOAL) || 10000,
    emailSubscription: true,
    emailNotifications: { ...DEFAULT_EMAIL_NOTIFICATIONS },
    lastMotivationEmail: null,
    createdAt,
    updatedAt: createdAt,
  };

  await usersCollection.insertOne(user);
  return user as UserWithoutPassword;
}

let userIndexesEnsured = false;

export async function ensureUserIndexes(): Promise<void> {
  if (userIndexesEnsured) return;
  const col = getUsersCollection();
  await col.createIndex({ email: 1 }, { unique: true });
  await col.createIndex({ appleId: 1 }, { unique: true, sparse: true });
  await col.createIndex({ username: 1 }, { unique: true, sparse: true });
  userIndexesEnsured = true;
}

async function getUserByAppleId(appleId: string): Promise<User | null> {
  const usersCollection = getUsersCollection();
  return usersCollection.findOne({ appleId });
}

async function getUserByEmail(email: string): Promise<User | null> {
  const usersCollection = getUsersCollection();
  return usersCollection.findOne({ email: email.toLowerCase().trim() });
}

async function getUserByUsername(username: string): Promise<User | null> {
  const usersCollection = getUsersCollection();
  return usersCollection.findOne({ username: username.trim() });
}

async function getUserByEmailOrUsername(emailOrUsername: string): Promise<User | null> {
  const trimmed = emailOrUsername.trim();
  if (trimmed.includes('@')) {
    return getUserByEmail(trimmed);
  }
  return getUserByUsername(trimmed);
}

async function getUserById(userId: string): Promise<UserWithoutPassword | null> {
  const usersCollection = getUsersCollection();
  const user = await usersCollection.findOne({ userId });

  if (!user) return null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

async function authenticateUser(email: string, password: string): Promise<AuthResult> {
  const user = await getUserByEmail(email);

  if (!user || !user.password) {
    return { success: false, message: 'Invalid credentials' };
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return { success: false, message: 'Invalid credentials' };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = user;
  return { success: true, user: userWithoutPassword };
}

async function authenticateUserByEmailOrUsername(
  emailOrUsername: string,
  password: string
): Promise<AuthResult> {
  const user = await getUserByEmailOrUsername(emailOrUsername);

  if (!user || !user.password) {
    return { success: false, message: 'User not found' };
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return { success: false, message: 'Invalid credentials' };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = user;
  return { success: true, user: userWithoutPassword };
}

async function getUsersByIds(userIds: string[]): Promise<UserWithoutPassword[]> {
  if (!userIds.length) return [];
  const usersCollection = getUsersCollection();
  const users = await usersCollection
    .find({ userId: { $in: userIds } })
    .project({ password: 0 })
    .toArray();
  return users as UserWithoutPassword[];
}

async function listUserSuggestions(
  excludeUserIds: string[],
  limit: number
): Promise<UserWithoutPassword[]> {
  const usersCollection = getUsersCollection();
  const users = await usersCollection
    .find({ userId: { $nin: excludeUserIds } })
    .project({ password: 0, email: 0 })
    .sort({ name: 1, createdAt: -1 })
    .limit(limit)
    .toArray();
  return users as UserWithoutPassword[];
}

async function listUsersWithStepSharing(limit: number): Promise<UserWithoutPassword[]> {
  const usersCollection = getUsersCollection();
  const users = await usersCollection
    .find({
      $or: [{ shareStepsEnabled: true }, { shareStepsEnabled: { $exists: false } }],
    })
    .project({ password: 0, email: 0 })
    .sort({ name: 1 })
    .limit(limit)
    .toArray();
  return users as UserWithoutPassword[];
}

async function updateUser(
  userId: string,
  updates: UpdateUserParams
): Promise<UserWithoutPassword | null> {
  const usersCollection = getUsersCollection();
  const updateDoc = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await usersCollection.updateOne({ userId }, { $set: updateDoc });

  return getUserById(userId);
}

async function addSavedTrainer(userId: string, trainerId: string): Promise<string[]> {
  const usersCollection = getUsersCollection();
  await usersCollection.updateOne(
    { userId },
    {
      $addToSet: { savedTrainerIds: trainerId as never },
      $set: { updatedAt: new Date().toISOString() },
    }
  );
  const user = await getUserById(userId);
  return (user?.savedTrainerIds as string[]) || [];
}

async function removeSavedTrainer(userId: string, trainerId: string): Promise<string[]> {
  const usersCollection = getUsersCollection();
  await usersCollection.updateOne(
    { userId },
    {
      $pull: { savedTrainerIds: trainerId as never },
      $set: { updatedAt: new Date().toISOString() },
    }
  );
  const user = await getUserById(userId);
  return (user?.savedTrainerIds as string[]) || [];
}

async function addTrainerRole(userId: string): Promise<void> {
  const usersCollection = getUsersCollection();
  await usersCollection.updateOne(
    { userId },
    {
      $addToSet: { roles: 'trainer' as never },
      $set: { updatedAt: new Date().toISOString() },
    }
  );
}

export {
  addSavedTrainer,
  addTrainerRole,
  authenticateUser,
  authenticateUserByEmailOrUsername,
  createSocialUser,
  createUser,
  getUserByAppleId,
  getUserByEmail,
  getUserByUsername,
  getUserByEmailOrUsername,
  getUserById,
  getUsersByIds,
  listUserSuggestions,
  listUsersWithStepSharing,
  removeSavedTrainer,
  updateUser,
};
