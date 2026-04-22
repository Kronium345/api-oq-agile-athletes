import express, { Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import {
    getExerciseHistory,
    getAllExercises,
    recordExercise,
} from '../models/exerciseHistory.js';
import {
    getFavorites,
    isFavorite,
    toggleFavorite,
} from '../models/favorites.js';

const router = express.Router();

function validateHistoryPayload(payload: any): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  if (!payload.exerciseName || typeof payload.exerciseName !== 'string') {
    errors.push({ field: 'exerciseName', message: 'exerciseName is required and must be a string' });
  }

  const numericFields = ['sets', 'reps', 'weight', 'duration', 'caloriesBurned', 'calories'];
  for (const field of numericFields) {
    if (payload[field] !== undefined && Number.isNaN(Number(payload[field]))) {
      errors.push({ field, message: `${field} must be a valid number` });
    }
  }

  if (payload.notes !== undefined && typeof payload.notes !== 'string') {
    errors.push({ field: 'notes', message: 'notes must be a string' });
  }

  return errors;
}


router.post('/history', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  console.log('[history] request received', {
    path: req.path,
    method: req.method,
    userId: req.userId,
  });
  
  try {
    const userId = req.userId;
    const exerciseData = req.body;

    if (!userId) {
      console.log('[history] auth failed - missing userId');
      return res.status(401).json({
        success: false,
        message: 'User authentication failed',
      });
    }

    const validationErrors = validateHistoryPayload(exerciseData);
    if (validationErrors.length > 0) {
      console.log('[history] validation failed', { userId, validationErrors });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors,
      });
    }

    let setDetailsArray = null;
    if (exerciseData.setDetails) {
      if (Array.isArray(exerciseData.setDetails)) {
        setDetailsArray = exerciseData.setDetails;
      } else {
        // Convert object format to array format
        setDetailsArray = Object.entries(exerciseData.setDetails).map(([setNumber, data]: [string, any]) => ({
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

    console.log('[history] writing exercise log', {
      userId,
      exerciseName: processedData.exerciseName,
    });
    const result = await recordExercise(userId, processedData);
    console.log('[history] exercise logged successfully', {
      userId,
      exerciseId: result.exerciseId,
    });

    res.status(201).json({
      success: true,
      message: 'Exercise logged successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('[history] DB write failed', {
      path: req.path,
      userId: req.userId,
      message: error?.message,
    });
    
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
router.post('/toggle-favorite', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  console.log('🔧 BACKEND: Toggle favorite request received');
  const { exerciseName } = req.body;
  const userId = req.userId!;
  
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
    const result = await toggleFavorite(userId, exerciseName);
    const action = result.isFavorite ? 'added' : 'removed';
    const statusCode = result.isFavorite ? 201 : 200;

    console.log(`✅ Successfully ${action === 'added' ? 'favorited' : 'unfavorited'}:`, exerciseName);
    return res.status(statusCode).json({
      message: result.isFavorite ? 'Exercise favorited' : 'Exercise unfavorited',
      action,
      exerciseName,
      userId,
      previousState: isCurrentlyFavorite,
      currentState: result.isFavorite,
    });
    
  } catch (error: any) {
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
router.get('/favorites/:userId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
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
    
  } catch (error: any) {
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
router.get('/history', authenticate, async (req: AuthenticatedRequest, res: Response) => {
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
  } catch (error: any) {
    console.error('Get exercise history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get exercise history',
      error: error.message,
    });
  }
});

export default router;
