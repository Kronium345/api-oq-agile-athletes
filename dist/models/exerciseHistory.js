import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.js';
const EXERCISE_HISTORY_TABLE = process.env.MONGO_EXERCISE_HISTORY_COLLECTION || 'exercise_history';
function getExerciseHistoryCollection() {
    const client = getMongoClient();
    const db = client.db(getMongoDbName());
    return db.collection(EXERCISE_HISTORY_TABLE);
}
async function recordExercise(userId, exerciseData) {
    console.log('[exercise-history] recordExercise called', {
        userId,
        exerciseName: exerciseData.exerciseName,
    });
    const exerciseId = uuidv4();
    const timeStamp = new Date().toISOString();
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
    const collection = getExerciseHistoryCollection();
    try {
        await collection.insertOne(item);
        return item;
    }
    catch (error) {
        console.error('[exercise-history] DB insert failed', {
            userId,
            message: error?.message,
        });
        throw error;
    }
}
/**
 * Get exercise history for a user within a date range
 */
async function getExerciseHistory(userId, startDate, endDate) {
    const collection = getExerciseHistoryCollection();
    const start = new Date(startDate).toISOString();
    const end = new Date(endDate).toISOString();
    return collection
        .find({ userId, timeStamp: { $gte: start, $lte: end } })
        .sort({ timeStamp: -1 })
        .toArray();
}
/**
 * Get all exercises for a user (paginated)
 */
async function getAllExercises(userId, limit = 50, lastEvaluatedKey = null) {
    const collection = getExerciseHistoryCollection();
    const query = { userId };
    if (lastEvaluatedKey?.timeStamp) {
        query.timeStamp = { $lt: String(lastEvaluatedKey.timeStamp) };
    }
    const items = await collection.find(query).sort({ timeStamp: -1 }).limit(limit).toArray();
    const lastItem = items[items.length - 1];
    return {
        items,
        lastEvaluatedKey: lastItem
            ? { userId: lastItem.userId, timeStamp: lastItem.timeStamp }
            : undefined,
    };
}
/**
 * Get exercise by ID
 */
async function getExerciseById(userId, exerciseId) {
    const collection = getExerciseHistoryCollection();
    return collection.findOne({ userId, exerciseId });
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
