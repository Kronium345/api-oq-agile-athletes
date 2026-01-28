import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getFavorites, toggleFavorite } from '../models/favorites.js';
const router = express.Router();
router.post('/toggle', authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        const { exerciseName, exerciseId } = req.body;
        if (!exerciseName && !exerciseId) {
            return res.status(400).json({
                success: false,
                message: 'exerciseName or exerciseId is required',
            });
        }
        // Use exerciseId as the identifier, fallback to exerciseName
        const exerciseIdentifier = exerciseId || exerciseName;
        const result = await toggleFavorite(userId, exerciseIdentifier);
        res.json({
            success: true,
            message: 'Favorite status updated',
            data: result,
        });
    }
    catch (error) {
        console.error('Toggle favorite error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle favorite',
            error: error.message,
        });
    }
});
router.get('/:userId', authenticate, async (req, res) => {
    try {
        const { userId } = req.params;
        if (userId !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized',
            });
        }
        const favorites = await getFavorites(userId);
        res.json({
            success: true,
            data: favorites,
        });
    }
    catch (error) {
        console.error('Get favorites error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get favorites',
            error: error.message,
        });
    }
});
export default router;
