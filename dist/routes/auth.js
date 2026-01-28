import express from 'express';
import { authenticateUser, createUser, getUserById } from '../models/user.js';
const router = express.Router();
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and password are required',
            });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format',
            });
        }
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters',
            });
        }
        const user = await createUser({ name, email, password });
        const session = user.userId;
        const userWithId = {
            ...user,
            _id: user.userId
        };
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: userWithId,
            session,
        });
    }
    catch (error) {
        console.error('Signup error:', error);
        if (error.name === 'ConditionalCheckFailedException') {
            return res.status(409).json({
                success: false,
                message: 'Email already exists',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to create user',
            error: error.message,
        });
    }
});
/**
 * Sign in - Authenticate user
 */
router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required',
            });
        }
        const result = await authenticateUser(email, password);
        if (!result.success || !result.user) {
            return res.status(401).json({
                success: false,
                message: result.message || 'Invalid credentials',
            });
        }
        // Generate session token (userId for now)
        // In production, use JWT
        const session = result.user.userId;
        // Add _id field to match template expectations
        const userWithId = {
            ...result.user,
            _id: result.user.userId // Map userId to _id for template compatibility
        };
        res.json({
            success: true,
            message: 'Signed in successfully',
            user: userWithId,
            session,
        });
    }
    catch (error) {
        console.error('Signin error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sign in',
            error: error.message,
        });
    }
});
/**
 * Get current user
 */
router.get('/current-user', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'No token provided',
            });
        }
        const token = authHeader.split(' ')[1];
        const user = await getUserById(token);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token',
            });
        }
        // Add _id field to match template expectations
        const userWithId = {
            ...user,
            _id: user.userId // Map userId to _id for template compatibility
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
