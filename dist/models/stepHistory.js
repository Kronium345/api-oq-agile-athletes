import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../config/ddbClient.js';
const STEP_HISTORY_TABLE = process.env.DDB_STEP_HISTORY_TABLE || 'StepHistory';
async function recordSteps(userId, date, stepCount) {
    const item = {
        userId,
        date,
        stepCount: Number(stepCount),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    await ddbDocClient.send(new PutCommand({
        TableName: STEP_HISTORY_TABLE,
        Item: item,
    }));
    return item;
}
async function getStepHistory(userId, startDate, endDate) {
    const result = await ddbDocClient.send(new QueryCommand({
        TableName: STEP_HISTORY_TABLE,
        KeyConditionExpression: 'userId = :userId AND #date BETWEEN :startDate AND :endDate',
        ExpressionAttributeNames: {
            '#date': 'date',
        },
        ExpressionAttributeValues: {
            ':userId': userId,
            ':startDate': startDate,
            ':endDate': endDate,
        },
        ScanIndexForward: false, // Sort descending by date
    }));
    return (result.Items || []);
}
/**
 * Get step count for a specific date
 */
async function getStepsByDate(userId, date) {
    const result = await ddbDocClient.send(new QueryCommand({
        TableName: STEP_HISTORY_TABLE,
        KeyConditionExpression: 'userId = :userId AND #date = :date',
        ExpressionAttributeNames: {
            '#date': 'date',
        },
        ExpressionAttributeValues: {
            ':userId': userId,
            ':date': date,
        },
    }));
    return result.Items?.[0] || null;
}
/**
 * Get total steps for a user (all time or within date range)
 */
async function getTotalSteps(userId, startDate = null, endDate = null) {
    let items;
    if (startDate && endDate) {
        items = await getStepHistory(userId, startDate, endDate);
    }
    else {
        // Get all steps for user
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: STEP_HISTORY_TABLE,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId,
            },
        }));
        items = (result.Items || []);
    }
    return items.reduce((total, item) => total + (item.stepCount || 0), 0);
}
/**
 * Update step count for a specific date
 */
async function updateSteps(userId, date, stepCount) {
    await ddbDocClient.send(new UpdateCommand({
        TableName: STEP_HISTORY_TABLE,
        Key: {
            userId,
            date,
        },
        UpdateExpression: 'SET stepCount = :stepCount, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
            ':stepCount': Number(stepCount),
            ':updatedAt': new Date().toISOString(),
        },
    }));
    return getStepsByDate(userId, date);
}
export { getStepHistory, getStepsByDate, getTotalSteps, recordSteps, updateSteps };
