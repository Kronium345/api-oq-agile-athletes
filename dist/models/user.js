import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
import { DEFAULT_EMAIL_NOTIFICATIONS, } from "../utils/emailNotifications.js";
const USERS_TABLE = process.env.MONGO_USERS_COLLECTION || 'users';
function getUsersCollection() {
    const client = getMongoClient();
    const db = client.db(getMongoDbName());
    return db.collection(USERS_TABLE);
}
function buildDisplayName(params) {
    if (params.name?.trim())
        return params.name.trim();
    const fromParts = [params.firstName, params.lastName].filter(Boolean).join(' ').trim();
    if (fromParts)
        return fromParts;
    return params.email;
}
async function createUser({ name, email, password, firstName, lastName, username, }) {
    const usersCollection = getUsersCollection();
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);
    const createdAt = new Date().toISOString();
    const displayName = buildDisplayName({ name, firstName, lastName, email });
    const user = {
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
async function getUserByEmail(email) {
    const usersCollection = getUsersCollection();
    return usersCollection.findOne({ email: email.toLowerCase().trim() });
}
async function getUserByUsername(username) {
    const usersCollection = getUsersCollection();
    return usersCollection.findOne({ username: username.trim() });
}
async function getUserByEmailOrUsername(emailOrUsername) {
    const trimmed = emailOrUsername.trim();
    if (trimmed.includes('@')) {
        return getUserByEmail(trimmed);
    }
    return getUserByUsername(trimmed);
}
async function getUserById(userId) {
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ userId });
    if (!user)
        return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
}
async function authenticateUser(email, password) {
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
async function authenticateUserByEmailOrUsername(emailOrUsername, password) {
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
async function getUsersByIds(userIds) {
    if (!userIds.length)
        return [];
    const usersCollection = getUsersCollection();
    const users = await usersCollection
        .find({ userId: { $in: userIds } })
        .project({ password: 0 })
        .toArray();
    return users;
}
async function listUserSuggestions(excludeUserIds, limit) {
    const usersCollection = getUsersCollection();
    const users = await usersCollection
        .find({ userId: { $nin: excludeUserIds } })
        .project({ password: 0, email: 0 })
        .sort({ name: 1, createdAt: -1 })
        .limit(limit)
        .toArray();
    return users;
}
async function listUsersWithStepSharing(limit) {
    const usersCollection = getUsersCollection();
    const users = await usersCollection
        .find({
        $or: [{ shareStepsEnabled: true }, { shareStepsEnabled: { $exists: false } }],
    })
        .project({ password: 0, email: 0 })
        .sort({ name: 1 })
        .limit(limit)
        .toArray();
    return users;
}
async function updateUser(userId, updates) {
    const usersCollection = getUsersCollection();
    const updateDoc = {
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    await usersCollection.updateOne({ userId }, { $set: updateDoc });
    return getUserById(userId);
}
async function addSavedTrainer(userId, trainerId) {
    const usersCollection = getUsersCollection();
    await usersCollection.updateOne({ userId }, {
        $addToSet: { savedTrainerIds: trainerId },
        $set: { updatedAt: new Date().toISOString() },
    });
    const user = await getUserById(userId);
    return user?.savedTrainerIds || [];
}
async function removeSavedTrainer(userId, trainerId) {
    const usersCollection = getUsersCollection();
    await usersCollection.updateOne({ userId }, {
        $pull: { savedTrainerIds: trainerId },
        $set: { updatedAt: new Date().toISOString() },
    });
    const user = await getUserById(userId);
    return user?.savedTrainerIds || [];
}
async function addTrainerRole(userId) {
    const usersCollection = getUsersCollection();
    await usersCollection.updateOne({ userId }, {
        $addToSet: { roles: 'trainer' },
        $set: { updatedAt: new Date().toISOString() },
    });
}
export { addSavedTrainer, addTrainerRole, authenticateUser, authenticateUserByEmailOrUsername, createUser, getUserByEmail, getUserByUsername, getUserByEmailOrUsername, getUserById, getUsersByIds, listUserSuggestions, listUsersWithStepSharing, removeSavedTrainer, updateUser, };
