import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../config/ddbClient.js';

const STEP_HISTORY_TABLE = process.env.MONGO_STEP_HISTORY_COLLECTION || 'step_history';

interface StepHistoryItem {
  userId: string;
  date: string;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}

async function recordSteps(userId: string, date: string, stepCount: number | string): Promise<StepHistoryItem> {
  const item: StepHistoryItem = {
    userId,
    date, 
    stepCount: Number(stepCount),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await ddbDocClient.send(
    new PutCommand({
      TableName: STEP_HISTORY_TABLE,
      Item: item,
    })
  );

  return item;
}

async function getStepHistory(userId: string, startDate: string, endDate: string): Promise<StepHistoryItem[]> {
  const result = await ddbDocClient.send(
    new QueryCommand({
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
    })
  );

  return (result.Items || []) as StepHistoryItem[];
}

/**
 * Get step count for a specific date
 */
async function getStepsByDate(userId: string, date: string): Promise<StepHistoryItem | null> {
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: STEP_HISTORY_TABLE,
      KeyConditionExpression: 'userId = :userId AND #date = :date',
      ExpressionAttributeNames: {
        '#date': 'date',
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':date': date,
      },
    })
  );

  return (result.Items?.[0] as StepHistoryItem) || null;
}

/**
 * Get total steps for a user (all time or within date range)
 */
async function getTotalSteps(userId: string, startDate: string | null = null, endDate: string | null = null): Promise<number> {
  let items: StepHistoryItem[];

  if (startDate && endDate) {
    items = await getStepHistory(userId, startDate, endDate);
  } else {
    // Get all steps for user
    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: STEP_HISTORY_TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      })
    );
    items = (result.Items || []) as StepHistoryItem[];
  }

  return items.reduce((total, item) => total + (item.stepCount || 0), 0);
}

/**
 * Update step count for a specific date
 */
async function updateSteps(userId: string, date: string, stepCount: number | string): Promise<StepHistoryItem | null> {
  await ddbDocClient.send(
    new UpdateCommand({
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
    })
  );

  return getStepsByDate(userId, date);
}

export {
    getStepHistory,
    getStepsByDate,
    getTotalSteps,
    recordSteps,
    updateSteps,
    // Export types
    type StepHistoryItem
};

