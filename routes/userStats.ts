import express, { Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import {
    getUserStats,
    resetUserStats,
    updateUserStats,
} from '../models/userStats.js';

const router = express.Router();

function normalizeStatsShape(stats: any) {
  return {
    totalWorkouts: Number(stats?.totalWorkouts || 0),
    totalCalories: Number(stats?.totalCalories || 0),
    totalMinutes: Number(stats?.totalMinutes || 0),
  };
}

router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    console.log('[user-stats] request received', {
      path: req.path,
      method: req.method,
      userId,
    });

    const stats = await getUserStats(userId);

    res.json({
      success: true,
      data: normalizeStatsShape(stats),
    });
  } catch (error: any) {
    console.error('[user-stats] DB read failed', {
      path: req.path,
      userId: req.userId,
      message: error?.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get user stats',
      error: error.message,
    });
  }
});

/**
 * POST /user-stats/update - Update user stats (increments values)
 * Body: { workouts?: number, calories?: number, minutes?: number }
 */
router.post('/update', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { workouts, calories, minutes } = req.body;
    console.log('[user-stats] update request received', {
      path: req.path,
      method: req.method,
      userId,
      body: req.body,
    });

    const updates: {
      workouts?: number;
      calories?: number;
      minutes?: number;
    } = {};

    if (workouts !== undefined) {
      const parsed = Number(workouts);
      if (Number.isNaN(parsed)) {
        return res.status(400).json({
          success: false,
          message: 'workouts must be a valid number',
        });
      }
      updates.workouts = parsed;
    }
    if (calories !== undefined) {
      const parsed = Number(calories);
      if (Number.isNaN(parsed)) {
        return res.status(400).json({
          success: false,
          message: 'calories must be a valid number',
        });
      }
      updates.calories = parsed;
    }
    if (minutes !== undefined) {
      const parsed = Number(minutes);
      if (Number.isNaN(parsed)) {
        return res.status(400).json({
          success: false,
          message: 'minutes must be a valid number',
        });
      }
      updates.minutes = parsed;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one of workouts, calories, or minutes is required',
      });
    }

    const updatedStats = await updateUserStats(userId, updates);

    res.json({
      success: true,
      message: 'Stats updated successfully',
      data: normalizeStatsShape(updatedStats),
    });
  } catch (error: any) {
    console.error('[user-stats] DB write failed', {
      path: req.path,
      userId: req.userId,
      message: error?.message,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to update user stats',
      error: error.message,
    });
  }
});

/**
 * POST /user-stats/reset - Reset user stats to zero (admin/testing)
 */
router.post('/reset', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const resetStats = await resetUserStats(userId);

    res.json({
      success: true,
      message: 'Stats reset successfully',
      data: resetStats,
    });
  } catch (error: any) {
    console.error('Reset user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset user stats',
      error: error.message,
    });
  }
});

export default router;

