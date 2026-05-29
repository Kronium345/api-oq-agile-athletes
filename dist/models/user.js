import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
const USERS_TABLE = process.env.MONGO_USERS_COLLECTION || 'users';
function getUsersCollection() {
    const client = getMongoClient();
    const db = client.db(getMongoDbName());
    return db.collection(USERS_TABLE);
}
async function createUser({ name, email, password }) {
    const usersCollection = getUsersCollection();
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);
    const createdAt = new Date().toISOString();
    const user = {
        userId,
        email,
        name,
        password: hashedPassword,
        shareStepsEnabled: true,
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
    return usersCollection.findOne({ email });
}
/**
 * Get user by userId
 */
async function getUserById(userId) {
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ userId });
    if (!user)
        return null;
    // Remove password from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
}
/**
 * Authenticate user (verify password)
 */
async function authenticateUser(email, password) {
    const user = await getUserByEmail(email);
    if (!user) {
        return { success: false, message: 'Invalid credentials' };
    }
    const isValid = await bcrypt.compare(password, user.password);
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
export { authenticateUser, createUser, getUserByEmail, getUserById, getUsersByIds, listUserSuggestions, listUsersWithStepSharing, updateUser };
