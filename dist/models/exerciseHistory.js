import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { ddbDocClient } from '../config/ddbClient.js';
const EXERCISE_HISTORY_TABLE = process.env.MONGO_EXERCISE_HISTORY_COLLECTION || 'exercise_history';
async function recordExercise(userId, exerciseData) {
    console.log('=== MODEL: recordExercise function called ===');
    console.log('UserId received:', userId);
    console.log('Exercise data received:', JSON.stringify(exerciseData, null, 2));
    console.log('Table name:', EXERCISE_HISTORY_TABLE);
    const exerciseId = uuidv4();
    const timeStamp = new Date().toISOString();
    console.log('Generated exerciseId:', exerciseId);
    console.log('Generated timeStamp:', timeStamp);
    let processedSetDetails = null;
    if (exerciseData.setDetails) {
        if (Array.isArray(exerciseData.setDetails)) {
            processedSetDetails = exerciseData.setDetails;
        }
        else if (typeof exerciseData.setDetails === 'object') {
            processedSetDetails = Object.entries(exerciseData.setDetails).map(([setNumber, data]) => ({
                setNumber: parseInt(setNumber),
                weight: parseFloat(data.weight || 0),
                reps: parseInt(data.reps || 0),
                rest: data.rest || '0s'
            }));
        }
    }
    const item = {
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
    }
    catch (error) {
        console.error('=== MODEL: DynamoDB insert failed ===');
        console.error('Error:', error);
        console.error('Error message:', error.message);
        throw error;
    }
}
/**
 * Get exercise history for a user within a date range
 */
async function getExerciseHistory(userId, startDate, endDate) {
    const result = await ddbDocClient.send(new QueryCommand({
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
    }));
    return (result.Items || []);
}
/**
 * Get all exercises for a user (paginated)
 */
async function getAllExercises(userId, limit = 50, lastEvaluatedKey = null) {
    const params = {
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
        items: (result.Items || []),
        lastEvaluatedKey: result.LastEvaluatedKey,
    };
}
/**
 * Get exercise by ID
 */
async function getExerciseById(userId, exerciseId) {
    // Since exerciseId is not part of the key, we need to query and filter
    const result = await ddbDocClient.send(new QueryCommand({
        TableName: EXERCISE_HISTORY_TABLE,
        KeyConditionExpression: 'userId = :userId',
        FilterExpression: 'exerciseId = :exerciseId',
        ExpressionAttributeValues: {
            ':userId': userId,
            ':exerciseId': exerciseId,
        },
    }));
    return (result.Items?.[0] || null);
}
/**
 * Get total exercise duration for a user (all time or within date range)
 */
async function getTotalExerciseDuration(userId, startDate = null, endDate = null) {
    let items;
    if (startDate && endDate) {
        items = await getExerciseHistory(userId, startDate, endDate);
    }
    else {
        const result = await getAllExercises(userId, 1000); // Get large batch
        items = result.items;
    }
    return items.reduce((total, item) => total + (item.duration || 0), 0);
}
/**
 * Get total calories burned from exercises
 */
async function getTotalCaloriesBurned(userId, startDate = null, endDate = null) {
    let items;
    if (startDate && endDate) {
        items = await getExerciseHistory(userId, startDate, endDate);
    }
    else {
        const result = await getAllExercises(userId, 1000);
        items = result.items;
    }
    return items.reduce((total, item) => total + (item.calories || 0), 0);
}
export { getAllExercises, getExerciseById, getExerciseHistory, getTotalCaloriesBurned, getTotalExerciseDuration, recordExercise };
