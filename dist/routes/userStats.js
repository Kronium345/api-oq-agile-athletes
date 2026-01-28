import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getUserStats, resetUserStats, updateUserStats, } from '../models/userStats.js';
const router = express.Router();
router.get('/', authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const stats = await getUserStats(userId);
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        console.error('Get user stats error:', error);
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
router.post('/update', authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const { workouts, calories, minutes } = req.body;
        const updates = {};
        if (workouts !== undefined) {
            updates.workouts = Number(workouts);
        }
        if (calories !== undefined) {
            updates.calories = Number(calories);
        }
        if (minutes !== undefined) {
            updates.minutes = Number(minutes);
        }
        const updatedStats = await updateUserStats(userId, updates);
        res.json({
            success: true,
            message: 'Stats updated successfully',
            data: updatedStats,
        });
    }
    catch (error) {
        console.error('Update user stats error:', error);
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
router.post('/reset', authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const resetStats = await resetUserStats(userId);
        res.json({
            success: true,
            message: 'Stats reset successfully',
            data: resetStats,
        });
    }
    catch (error) {
        console.error('Reset user stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset user stats',
            error: error.message,
        });
    }
});
export default router;
