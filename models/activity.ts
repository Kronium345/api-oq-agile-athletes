import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../config/ddbClient.js';

const ACTIVITY_TABLE = process.env.MONGO_ACTIVITY_COLLECTION || 'user_activity';

interface ActivityItem {
  userId: string;
  date: string; 
  timestamp: string;
  activityType: string;
  createdAt: string;
  updatedAt: string;
}

async function recordActivity(userId: string, date?: string): Promise<ActivityItem> {
  if (!userId) {
    throw new Error('userId is required');
  }

  const timestamp = new Date().toISOString();
  const activityDate = date || new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

  // Ensure date is not empty
  if (!activityDate) {
    throw new Error('date cannot be empty');
  }

  const item: ActivityItem = {
    userId,
    date: activityDate,
    timestamp,
    activityType: 'app_usage',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: ACTIVITY_TABLE,
        Item: item,
        // Only create if it doesn't exist for this date
        ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(#date)',
        ExpressionAttributeNames: {
          '#date': 'date'
        }
      })
    );
  } catch (error: any) {
    // If item already exists, that's okay - just ignore the condition failure
    if (error.name !== 'ConditionalCheckFailedException') {
      throw error;
    }
  }

  return item;
}

/**
 * Get activity data for a user within a date range
 */
async function getActivityData(userId: string, startDate: string, endDate: string): Promise<ActivityItem[]> {
  if (!userId || !startDate || !endDate) {
    console.error('getActivityData: Missing userId, startDate, or endDate');
    throw new Error('Missing required parameters for getActivityData');
  }

  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: ACTIVITY_TABLE,
      KeyConditionExpression: 'userId = :userId AND #date BETWEEN :startDate AND :endDate',
      ExpressionAttributeNames: {
        '#date': 'date'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startDate': startDate,
        ':endDate': endDate,
      },
      ScanIndexForward: false, // Sort by date descending
    })
  );

  return (result.Items || []) as ActivityItem[];
}

export {
  getActivityData,
  recordActivity,
  // Export types
  type ActivityItem
};

