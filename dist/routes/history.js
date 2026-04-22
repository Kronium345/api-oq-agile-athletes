import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import express from 'express';
import { ddbDocClient } from '../config/ddbClient.js';
import { authenticate } from '../middleware/auth.js';
import { getAllExercises, recordExercise, } from '../models/exerciseHistory.js';
import { getFavorites, isFavorite } from '../models/favorites.js';
const FAVORITES_TABLE = process.env.MONGO_FAVORITES_COLLECTION || 'favorites';
const router = express.Router();
router.post('/history', authenticate, async (req, res) => {
    console.log('=== BACKEND: Exercise History Logging Started ===');
    console.log('Request headers:', req.headers);
    console.log('Auth middleware userId:', req.userId);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    try {
        const userId = req.userId;
        const exerciseData = req.body;
        console.log('=== BACKEND: History Validation ===');
        console.log('UserId from auth:', userId);
        console.log('Exercise data received:', exerciseData);
        console.log('Exercise name:', exerciseData.exerciseName);
        if (!exerciseData.exerciseName) {
            console.log('=== BACKEND: Validation Failed - No exercise name ===');
            return res.status(400).json({
                success: false,
                message: 'exerciseName is required',
            });
        }
        if (!userId) {
            console.log('=== BACKEND: Validation Failed - No userId ===');
            return res.status(401).json({
                success: false,
                message: 'User authentication failed',
            });
        }
        // Convert setDetails from object to array format (match template)
        let setDetailsArray = null;
        if (exerciseData.setDetails) {
            if (Array.isArray(exerciseData.setDetails)) {
                setDetailsArray = exerciseData.setDetails;
            }
            else {
                // Convert object format to array format
                setDetailsArray = Object.entries(exerciseData.setDetails).map(([setNumber, data]) => ({
                    setNumber: parseInt(setNumber),
                    weight: parseFloat(data.weight || 0),
                    reps: parseInt(data.reps || 0),
                    rest: data.rest || '0s'
                }));
            }
        }
        const processedData = {
            ...exerciseData,
            setDetails: setDetailsArray
        };
        console.log('=== BACKEND: Calling recordExercise ===');
        const result = await recordExercise(userId, processedData);
        console.log('=== BACKEND: Exercise recorded successfully ===');
        console.log('Result:', result);
        res.status(201).json({
            success: true,
            message: 'Exercise logged successfully',
            data: result,
        });
    }
    catch (error) {
        console.error('=== BACKEND: Record exercise history error ===');
        console.error('Error details:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to log exercise',
            error: error.message,
        });
    }
});
/**
 * Toggle favorite exercise - matches template endpoint: POST /history/toggle-favorite
 */
router.post('/toggle-favorite', authenticate, async (req, res) => {
    console.log('🔧 BACKEND: Toggle favorite request received');
    const { exerciseName } = req.body;
    const userId = req.userId;
    console.log('Request data:', {
        userId,
        exerciseName,
        timestamp: new Date().toISOString()
    });
    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'User authentication failed',
        });
    }
    if (!exerciseName) {
        return res.status(400).json({
            success: false,
            message: 'exerciseName is required',
        });
    }
    try {
        console.log('🔍 Checking existing favorite...');
        const isCurrentlyFavorite = await isFavorite(userId, exerciseName);
        console.log('Existing favorite found:', isCurrentlyFavorite);
        if (isCurrentlyFavorite) {
            console.log('❌ Removing from favorites...');
            try {
                await ddbDocClient.send(new DeleteCommand({
                    TableName: FAVORITES_TABLE,
                    Key: {
                        userId,
                        exerciseName,
                    },
                }));
                console.log('✅ Successfully unfavorited:', exerciseName);
                return res.status(200).json({
                    message: 'Exercise unfavorited',
                    action: 'removed',
                    exerciseName,
                    userId
                });
            }
            catch (deleteError) {
                if (deleteError.name === 'ResourceNotFoundException') {
                    console.log('⚠️ Table not found - simulating unfavorite');
                    return res.status(200).json({
                        message: 'Exercise unfavorited',
                        action: 'removed',
                        exerciseName,
                        userId,
                        note: 'Simulated - table not configured'
                    });
                }
                throw deleteError;
            }
        }
        else {
            console.log('⭐ Adding to favorites...');
            const timestamp = new Date().toISOString();
            const newFavorite = {
                userId,
                exerciseName,
                isFavorite: true,
                createdAt: timestamp,
                updatedAt: timestamp,
            };
            try {
                await ddbDocClient.send(new PutCommand({
                    TableName: FAVORITES_TABLE,
                    Item: newFavorite,
                }));
                console.log('✅ Successfully favorited:', exerciseName);
                return res.status(201).json({
                    message: 'Exercise favorited',
                    favorite: newFavorite,
                    action: 'added',
                    exerciseName,
                    userId
                });
            }
            catch (putError) {
                if (putError.name === 'ResourceNotFoundException') {
                    // Table doesn't exist, but pretend we favorited
                    console.log('⚠️ Table not found - simulating favorite');
                    return res.status(201).json({
                        message: 'Exercise favorited',
                        favorite: newFavorite,
                        action: 'added',
                        exerciseName,
                        userId,
                        note: 'Simulated - table not configured'
                    });
                }
                throw putError;
            }
        }
    }
    catch (error) {
        console.error('❌ BACKEND ERROR:', error);
        res.status(500).json({
            message: 'Failed to toggle favorite',
            error: error.message
        });
    }
});
/**
 * Get user favorites - matches template endpoint: GET /history/favorites/:userId
 */
router.get('/favorites/:userId', authenticate, async (req, res) => {
    console.log('🔧 BACKEND: Get favorites request');
    const { userId } = req.params;
    const requestUserId = req.userId;
    console.log('Fetching favorites for user:', userId);
    if (userId !== requestUserId) {
        return res.status(403).json({
            success: false,
            message: 'Unauthorized access',
        });
    }
    try {
        const favorites = await getFavorites(userId);
        console.log(`Found ${favorites.length} favorites for user ${userId}`);
        console.log('Favorites:', favorites.map(f => ({
            exerciseName: f.exerciseName,
            dateFavorited: f.createdAt
        })));
        // Step 2: Return favorites array in template format
        const favoritesResponse = favorites.map(fav => ({
            exerciseName: fav.exerciseName,
            dateFavorited: fav.createdAt || fav.updatedAt,
            userId: fav.userId
        }));
        res.status(200).json(favoritesResponse);
    }
    catch (error) {
        console.error('❌ Error fetching favorites:', error);
        if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
            console.warn('⚠️ Favorites table not found - returning empty array');
            return res.status(200).json([]);
        }
        res.status(500).json({
            message: 'Failed to fetch favorites',
            error: error.message
        });
    }
});
/**
 */
router.get('/history', authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User authentication failed',
            });
        }
        const { items } = await getAllExercises(userId, 1000);
        return res.json({
            success: true,
            data: items,
        });
    }
    catch (error) {
        console.error('Get exercise history error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get exercise history',
            error: error.message,
        });
    }
});
export default router;
