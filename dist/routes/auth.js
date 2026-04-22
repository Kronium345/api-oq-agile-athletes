import express from 'express';
import { authenticate } from '../middleware/auth.js';
const router = express.Router();
router.post('/signup', async (req, res) => {
    res.status(410).json({
        success: false,
        message: 'This endpoint is disabled. Use Clerk sign-up on the frontend.',
    });
});
/**
 * Sign in - Authenticate user
 */
router.post('/signin', async (req, res) => {
    res.status(410).json({
        success: false,
        message: 'This endpoint is disabled. Use Clerk sign-in on the frontend.',
    });
});
/**
 * Get current user
 */
router.get('/current-user', authenticate, async (req, res) => {
    try {
        const user = req.user;
        // Add _id field to match template expectations
        const userWithId = {
            ...user,
            _id: user.userId
        };
        res.json({
            success: true,
            user: userWithId,
        });
    }
    catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user',
            error: error.message,
        });
    }
});
export default router;
