import bcrypt from 'bcryptjs';
import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';

const USERS_TABLE = process.env.MONGO_USERS_COLLECTION || 'users';

interface CreateUserParams {
  name: string;
  email: string;
  password: string;
}

interface User {
  userId: string;
  email: string;
  name: string;
  password?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any; 
}

interface UserWithoutPassword {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

interface AuthResult {
  success: boolean;
  message?: string;
  user?: UserWithoutPassword;
}

interface UpdateUserParams {
  [key: string]: any;
}

function getUsersCollection(): Collection<User> {
  const client = getMongoClient();
  const db = client.db(getMongoDbName());
  return db.collection<User>(USERS_TABLE);
}

async function createUser({ name, email, password }: CreateUserParams): Promise<UserWithoutPassword> {
  const usersCollection = getUsersCollection();
  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash(password, 12);
  const createdAt = new Date().toISOString();

  const user: User = {
    userId,
    email,
    name,
    password: hashedPassword,
    createdAt,
    updatedAt: createdAt,
  };

  await usersCollection.insertOne(user);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

async function getUserByEmail(email: string): Promise<User | null> {
  const usersCollection = getUsersCollection();
  return usersCollection.findOne({ email });
}

/**
 * Get user by userId
 */
async function getUserById(userId: string): Promise<UserWithoutPassword | null> {
  const usersCollection = getUsersCollection();
  const user = await usersCollection.findOne({ userId });

  if (!user) return null;

  // Remove password from response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Authenticate user (verify password)
 */
async function authenticateUser(email: string, password: string): Promise<AuthResult> {
  const user = await getUserByEmail(email);
  
  if (!user) {
    return { success: false, message: 'Invalid credentials' };
  }

  const isValid = await bcrypt.compare(password, user.password!);
  
  if (!isValid) {
    return { success: false, message: 'Invalid credentials' };
  }

  // Return user without password
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = user;
  return { success: true, user: userWithoutPassword };
}

/**
 * Update user
 */
async function updateUser(userId: string, updates: UpdateUserParams): Promise<UserWithoutPassword | null> {
  const usersCollection = getUsersCollection();
  const updateDoc = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await usersCollection.updateOne({ userId }, { $set: updateDoc });

  return getUserById(userId);
}

export {
    authenticateUser,
    createUser,
    getUserByEmail,
    getUserById,
    updateUser, type AuthResult, type CreateUserParams, type UpdateUserParams,
    // Export types
    type User,
    type UserWithoutPassword
};

