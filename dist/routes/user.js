import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { authenticate } from "../middleware/auth.js";
import { getUserById, updateUser } from "../models/user.js";
import { addFriendship, getFriendsList, getSuggestions, removeFriendship, updateStepSharing, } from "../services/stepsSocial.js";
import { routeParam } from "../utils/routeParams.js";
const router = express.Router();
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const avatarDir = path.join('uploads', 'avatars');
        try {
            fs.mkdirSync(avatarDir, { recursive: true });
            cb(null, avatarDir);
        }
        catch (error) {
            cb(error, avatarDir);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Check file type
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
        }
    }
});
router.get('/suggestions', authenticate, async (req, res) => {
    try {
        const limitRaw = req.query.limit;
        const limit = typeof limitRaw === 'string' && Number(limitRaw) > 0
            ? Math.min(Number(limitRaw), 50)
            : 20;
        const users = await getSuggestions(req.userId, limit);
        return res.json({ success: true, users });
    }
    catch (error) {
        const err = error;
        console.error('Get suggestions error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch suggestions' });
    }
});
router.get('/friends', authenticate, async (req, res) => {
    try {
        const friends = await getFriendsList(req.userId);
        return res.json({ success: true, friends });
    }
    catch (error) {
        const err = error;
        console.error('Get friends error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch friends' });
    }
});
router.post('/friends/:friendUserId', authenticate, async (req, res) => {
    try {
        const friendUserId = routeParam(req.params.friendUserId);
        const result = await addFriendship(req.userId, friendUserId);
        if (!result.ok) {
            return res.status(result.status).json({ success: false, message: result.message });
        }
        return res.status(result.status).json({ success: true, friendUserId: result.friendUserId });
    }
    catch (error) {
        const err = error;
        console.error('Add friend error:', err);
        return res.status(500).json({ success: false, message: 'Failed to add friend' });
    }
});
router.delete('/friends/:friendUserId', authenticate, async (req, res) => {
    try {
        const friendUserId = routeParam(req.params.friendUserId);
        const result = await removeFriendship(req.userId, friendUserId);
        if (!result.ok) {
            return res.status(result.status).json({ success: false, message: result.message });
        }
        return res.json({ success: true });
    }
    catch (error) {
        const err = error;
        console.error('Remove friend error:', err);
        return res.status(500).json({ success: false, message: 'Failed to remove friend' });
    }
});
router.put('/step-sharing', authenticate, async (req, res) => {
    try {
        const { shareStepsEnabled } = req.body;
        if (typeof shareStepsEnabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'shareStepsEnabled (boolean) is required',
            });
        }
        const result = await updateStepSharing(req.userId, shareStepsEnabled);
        if (!result.ok) {
            return res.status(result.status).json({ success: false, message: result.message });
        }
        return res.json({ success: true, shareStepsEnabled: result.shareStepsEnabled });
    }
    catch (error) {
        const err = error;
        console.error('Update step sharing error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update step sharing' });
    }
});
// Get user profile
router.get('/:userId', authenticate, async (req, res) => {
    try {
        const userId = routeParam(req.params.userId);
        // Verify user can access this profile
        if (userId !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access',
            });
        }
        const user = await getUserById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        res.json({
            success: true,
            ...user,
        });
    }
    catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user profile',
            error: error.message,
        });
    }
});
// Update user profile
router.put('/:userId', authenticate, async (req, res) => {
    try {
        const userId = routeParam(req.params.userId);
        const updateData = { ...req.body };
        // Verify user can update this profile
        if (userId !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access',
            });
        }
        // Remove sensitive fields that shouldn't be updated via this endpoint
        delete updateData.password;
        delete updateData.email;
        delete updateData.userId;
        const updatedUser = await updateUser(userId, updateData);
        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        res.json({
            success: true,
            message: 'Profile updated successfully',
            ...updatedUser,
        });
    }
    catch (error) {
        console.error('Update user profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user profile',
            error: error.message,
        });
    }
});
// Upload avatar
router.put('/:userId/avatar', authenticate, upload.single('avatar'), async (req, res) => {
    try {
        const userId = routeParam(req.params.userId);
        // Verify user can update this profile
        if (userId !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access',
            });
        }
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded',
            });
        }
        // Update user with new avatar path
        const avatarPath = `uploads/avatars/${req.file.filename}`;
        const updatedUser = await updateUser(userId, { avatar: avatarPath });
        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        res.json({
            success: true,
            message: 'Avatar updated successfully',
            avatar: avatarPath,
        });
    }
    catch (error) {
        console.error('Upload avatar error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload avatar',
            error: error.message,
        });
    }
});
export default router;
