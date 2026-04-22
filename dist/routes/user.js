import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { authenticate } from '../middleware/auth.js';
import { getUserById, updateUser } from '../models/user.js';
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
// Get user profile
router.get('/:userId', authenticate, async (req, res) => {
    try {
        const { userId } = req.params;
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
        const { userId } = req.params;
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
        const { userId } = req.params;
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
