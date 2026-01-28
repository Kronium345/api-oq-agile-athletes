import express, { Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import {
    getAllExercises,
    getExerciseById,
    getExerciseHistory,
    getTotalCaloriesBurned,
    getTotalExerciseDuration,
    recordExercise,
    type ExerciseData,
} from '../models/exerciseHistory.js';

const router = express.Router();

interface ExerciseParams {
  exerciseId: string;
}

interface ExerciseQuery {
  startDate?: string;
  endDate?: string;
  limit?: string;
  lastKey?: string;
}

router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  console.log('=== BACKEND: Exercise Recording Started ===');
  console.log('Request headers:', req.headers);
  console.log('Auth middleware userId:', req.userId);
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const userId = req.userId;
    const exerciseData: ExerciseData = req.body;

    console.log('=== BACKEND: Validation ===');
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

    console.log('=== BACKEND: Calling recordExercise ===');
    const result = await recordExercise(userId, exerciseData);
    console.log('=== BACKEND: Exercise recorded successfully ===');
    console.log('Result:', result);

    res.status(201).json({
      success: true,
      message: 'Exercise recorded successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('=== BACKEND: Record exercise error ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to record exercise',
      error: error.message,
    });
  }
});


router.get('/history', authenticate, async (req: AuthenticatedRequest<{}, {}, {}, ExerciseQuery>, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.userId!;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate query parameters are required',
      });
    }

    const history = await getExerciseHistory(userId, startDate, endDate);

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    console.error('Get exercise history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get exercise history',
      error: error.message,
    });
  }
});

/**
 * Get all exercises (paginated)
 */
router.get('/', authenticate, async (req: AuthenticatedRequest<{}, {}, {}, ExerciseQuery>, res: Response) => {
  try {
    const { limit = '50', lastKey } = req.query;
    const userId = req.userId!;

    const result = await getAllExercises(
      userId,
      parseInt(limit, 10),
      lastKey ? JSON.parse(lastKey) : null
    );

    res.json({
      success: true,
      data: result.items,
      pagination: {
        lastEvaluatedKey: result.lastEvaluatedKey,
        hasMore: !!result.lastEvaluatedKey,
      },
    });
  } catch (error: any) {
    console.error('Get all exercises error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get exercises',
      error: error.message,
    });
  }
});

/**
 * Get exercise by ID
 */
router.get('/:exerciseId', authenticate, async (req: AuthenticatedRequest<ExerciseParams>, res: Response) => {
  try {
    const { exerciseId } = req.params;
    const userId = req.userId!;

    const exercise = await getExerciseById(userId, exerciseId);

    if (!exercise) {
      return res.status(404).json({
        success: false,
        message: 'Exercise not found',
      });
    }

    res.json({
      success: true,
      data: exercise,
    });
  } catch (error: any) {
    console.error('Get exercise by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get exercise',
      error: error.message,
    });
  }
});

/**
 * Get total exercise duration
 */
router.get('/stats/duration', authenticate, async (req: AuthenticatedRequest<{}, {}, {}, ExerciseQuery>, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.userId!;

    const totalDuration = await getTotalExerciseDuration(
      userId,
      startDate || null,
      endDate || null
    );

    res.json({
      success: true,
      data: { totalDuration },
    });
  } catch (error: any) {
    console.error('Get total duration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get total duration',
      error: error.message,
    });
  }
});

/**
 * Get total calories burned
 */
router.get('/stats/calories', authenticate, async (req: AuthenticatedRequest<{}, {}, {}, ExerciseQuery>, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.userId!;

    const totalCalories = await getTotalCaloriesBurned(
      userId,
      startDate || null,
      endDate || null
    );

    res.json({
      success: true,
      data: { totalCalories },
    });
  } catch (error: any) {
    console.error('Get total calories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get total calories',
      error: error.message,
    });
  }
});

export default router;
