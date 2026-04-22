import { GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { ddbDocClient } from '../config/ddbClient.js';
const USERS_TABLE = process.env.MONGO_USERS_COLLECTION || 'users';
async function createUser({ name, email, password }) {
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);
    const createdAt = new Date().toISOString();
    const user = {
        userId,
        email,
        name,
        password: hashedPassword,
        createdAt,
        updatedAt: createdAt,
    };
    await ddbDocClient.send(new PutCommand({
        TableName: USERS_TABLE,
        Item: user,
        ConditionExpression: 'attribute_not_exists(email)',
    }));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
}
async function getUserByEmail(email) {
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: USERS_TABLE,
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email,
            },
        }));
        return result.Items?.[0] || null;
    }
    catch (error) {
        // If GSI doesn't exist, fallback to scan (not recommended for production)
        console.warn('GSI not found, using alternative lookup method');
        console.warn('Error:', error.message);
        try {
            const result = await ddbDocClient.send(new ScanCommand({
                TableName: USERS_TABLE,
                FilterExpression: 'email = :email',
                ExpressionAttributeValues: {
                    ':email': email,
                },
            }));
            return result.Items?.[0] || null;
        }
        catch (scanError) {
            console.error('Scan fallback also failed:', scanError.message);
            throw scanError;
        }
    }
}
/**
 * Get user by userId
 */
async function getUserById(userId) {
    const result = await ddbDocClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { userId },
    }));
    if (!result.Item)
        return null;
    // Remove password from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...user } = result.Item;
    return user;
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
async function updateUser(userId, updates) {
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    Object.keys(updates).forEach((key, index) => {
        updateExpression.push(`#attr${index} = :val${index}`);
        expressionAttributeNames[`#attr${index}`] = key;
        expressionAttributeValues[`:val${index}`] = updates[key];
    });
    updateExpression.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    await ddbDocClient.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
    }));
    return getUserById(userId);
}
export { authenticateUser, createUser, getUserByEmail, getUserById, updateUser };
