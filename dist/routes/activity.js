import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getActivityData, recordActivity } from '../models/activity.js';
const router = express.Router();
router.post('/record', authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const { date } = req.body;
        const activityDate = date || new Date().toISOString().split('T')[0];
        const result = await recordActivity(userId, activityDate);
        res.json({
            success: true,
            message: 'Activity recorded successfully',
            data: result,
        });
    }
    catch (error) {
        console.error('Record activity error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record activity',
            error: error.message,
        });
    }
});
// Get activity data for date range
router.get('/:userId/:startDate/:endDate', authenticate, async (req, res) => {
    try {
        const { userId, startDate, endDate } = req.params;
        // Verify user can access this data
        if (userId !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access',
            });
        }
        const activities = await getActivityData(userId, startDate, endDate);
        res.json({
            success: true,
            data: activities,
        });
    }
    catch (error) {
        console.error('Get activity data error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get activity data',
            error: error.message,
        });
    }
});
export default router;
