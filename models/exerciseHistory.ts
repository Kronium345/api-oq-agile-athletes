import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { ddbDocClient } from '../config/ddbClient.js';

const EXERCISE_HISTORY_TABLE = process.env.DDB_EXERCISE_HISTORY_TABLE || 'ExerciseHistory';

// TypeScript interfaces
interface SetDetail {
  setNumber: number;
  weight: number;
  reps: number;
  rest: string;
}

interface ExerciseData {
  exerciseName: string;
  duration?: number;
  caloriesBurned?: number;
  calories?: number;
  sets?: number;
  reps?: number;
  weight?: number;
  setDetails?: SetDetail[] | { [key: string]: any } | null;
  notes?: string;
}

interface ExerciseHistoryItem {
  userId: string;
  timeStamp: string;  
  exerciseId: string;
  exerciseName: string;
  duration: number;
  calories: number;
  sets: number;
  reps: number;
  weight: number;
  setDetails: SetDetail[] | null;
  notes: string;
  createdAt: string;
}

interface PaginationResult {
  items: ExerciseHistoryItem[];
  lastEvaluatedKey?: any;
}

async function recordExercise(userId: string, exerciseData: ExerciseData): Promise<ExerciseHistoryItem> {
  console.log('=== MODEL: recordExercise function called ===');
  console.log('UserId received:', userId);
  console.log('Exercise data received:', JSON.stringify(exerciseData, null, 2));
  console.log('Table name:', EXERCISE_HISTORY_TABLE);

  const exerciseId = uuidv4();
  const timeStamp = new Date().toISOString();

  console.log('Generated exerciseId:', exerciseId);
  console.log('Generated timeStamp:', timeStamp);

  let processedSetDetails: SetDetail[] | null = null;
  if (exerciseData.setDetails) {
    if (Array.isArray(exerciseData.setDetails)) {
      processedSetDetails = exerciseData.setDetails as SetDetail[];
    } else if (typeof exerciseData.setDetails === 'object') {
      processedSetDetails = Object.entries(exerciseData.setDetails).map(([setNumber, data]: [string, any]) => ({
        setNumber: parseInt(setNumber),
        weight: parseFloat(data.weight || 0),
        reps: parseInt(data.reps || 0),
        rest: data.rest || '0s'
      }));
    }
  }

  const item: ExerciseHistoryItem = {
    userId,
    timeStamp,
    exerciseId,
    exerciseName: exerciseData.exerciseName,
    duration: Number(exerciseData.duration || 0), 
    calories: Number(exerciseData.caloriesBurned || exerciseData.calories || 0),
    sets: exerciseData.sets || 0,
    reps: exerciseData.reps || 0,
    weight: exerciseData.weight || 0,
    setDetails: processedSetDetails,
    notes: exerciseData.notes || '',
    createdAt: timeStamp,
  };

  console.log('=== MODEL: Final item to be inserted ===');
  console.log(JSON.stringify(item, null, 2));

  try {
    console.log('=== MODEL: Sending to DynamoDB ===');
    const command = new PutCommand({
      TableName: EXERCISE_HISTORY_TABLE,
      Item: item,
    });
    
    console.log('DynamoDB command:', command);
    const result = await ddbDocClient.send(command);
    console.log('=== MODEL: DynamoDB insert successful ===');
    console.log('DynamoDB result:', result);

    return item;
  } catch (error: any) {
    console.error('=== MODEL: DynamoDB insert failed ===');
    console.error('Error:', error);
    console.error('Error message:', error.message);
    throw error;
  }
}

/**
 * Get exercise history for a user within a date range
 */
async function getExerciseHistory(userId: string, startDate: string, endDate: string): Promise<ExerciseHistoryItem[]> {
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: EXERCISE_HISTORY_TABLE,
      KeyConditionExpression: 'userId = :userId AND #timeStamp BETWEEN :startDate AND :endDate',
      ExpressionAttributeNames: {
        '#timeStamp': 'timeStamp',
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startDate': startDate,
        ':endDate': endDate,
      },
      ScanIndexForward: false, 
    })
  );

  return (result.Items || []) as ExerciseHistoryItem[];
}

/**
 * Get all exercises for a user (paginated)
 */
async function getAllExercises(userId: string, limit = 50, lastEvaluatedKey: any = null): Promise<PaginationResult> {
  const params: any = {
    TableName: EXERCISE_HISTORY_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
    ScanIndexForward: false,
    Limit: limit,
  };

  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }

  const result = await ddbDocClient.send(new QueryCommand(params));

  return {
    items: (result.Items || []) as ExerciseHistoryItem[],
    lastEvaluatedKey: result.LastEvaluatedKey,
  };
}

/**
 * Get exercise by ID
 */
async function getExerciseById(userId: string, exerciseId: string): Promise<ExerciseHistoryItem | null> {
  // Since exerciseId is not part of the key, we need to query and filter
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: EXERCISE_HISTORY_TABLE,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'exerciseId = :exerciseId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':exerciseId': exerciseId,
      },
    })
  );

  return (result.Items?.[0] || null) as ExerciseHistoryItem | null;
}

/**
 * Get total exercise duration for a user (all time or within date range)
 */
async function getTotalExerciseDuration(userId: string, startDate: string | null = null, endDate: string | null = null): Promise<number> {
  let items: ExerciseHistoryItem[];

  if (startDate && endDate) {
    items = await getExerciseHistory(userId, startDate, endDate);
  } else {
    const result = await getAllExercises(userId, 1000); // Get large batch
    items = result.items;
  }

  return items.reduce((total, item) => total + (item.duration || 0), 0);
}

/**
 * Get total calories burned from exercises
 */
async function getTotalCaloriesBurned(userId: string, startDate: string | null = null, endDate: string | null = null): Promise<number> {
  let items: ExerciseHistoryItem[];

  if (startDate && endDate) {
    items = await getExerciseHistory(userId, startDate, endDate);
  } else {
    const result = await getAllExercises(userId, 1000);
    items = result.items;
  }

  return items.reduce((total, item) => total + (item.calories || 0), 0);
}

export {
  getAllExercises,
  getExerciseById,
  getExerciseHistory,
  getTotalCaloriesBurned,
  getTotalExerciseDuration,
  recordExercise,
  // Export types
  type ExerciseData,
  type ExerciseHistoryItem, type PaginationResult, type SetDetail
};

