import express, { Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.ts';
import { getUserById, updateUser, type UpdateUserParams } from '../models/user.ts';
import {
  addFriendship,
  getFriendsList,
  getSuggestions,
  removeFriendship,
  updateStepSharing,
} from '../services/stepsSocial.ts';
import { routeParam } from '../utils/routeParams.ts';
import { isValidExperience, isValidGender, toClientUser } from '../utils/userResponse.ts';

const router = express.Router();

interface UserParams {
  userId: string;
}

interface IdParams {
  id: string;
}

interface MulterRequest extends AuthenticatedRequest<UserParams> {
  file?: Express.Multer.File;
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const avatarDir = path.join('uploads', 'avatars');
    try {
      fs.mkdirSync(avatarDir, { recursive: true });
      cb(null, avatarDir);
    } catch (error) {
      cb(error as Error, avatarDir);
    }
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (_req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
  },
});

function assertSelfOr403(
  req: AuthenticatedRequest,
  targetId: string,
  res: Response
): targetId is string {
  if (targetId !== req.userId) {
    res.status(403).json({ success: false, message: 'Unauthorized access' });
    return false;
  }
  return true;
}

function avatarPublicPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

// --- Social / steps (existing) ---

router.get('/suggestions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limitRaw = req.query.limit;
    const limit =
      typeof limitRaw === 'string' && Number(limitRaw) > 0
        ? Math.min(Number(limitRaw), 50)
        : 20;
    const users = await getSuggestions(req.userId!, limit);
    return res.json({ success: true, users });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Get suggestions error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch suggestions' });
  }
});

router.get('/friends', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const friends = await getFriendsList(req.userId!);
    return res.json({ success: true, friends });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Get friends error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch friends' });
  }
});

router.post('/friends/:friendUserId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const friendUserId = routeParam(req.params.friendUserId);
    const result = await addFriendship(req.userId!, friendUserId);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }
    return res.status(result.status).json({ success: true, friendUserId: result.friendUserId });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Add friend error:', err);
    return res.status(500).json({ success: false, message: 'Failed to add friend' });
  }
});

router.delete('/friends/:friendUserId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const friendUserId = routeParam(req.params.friendUserId);
    const result = await removeFriendship(req.userId!, friendUserId);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }
    return res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Remove friend error:', err);
    return res.status(500).json({ success: false, message: 'Failed to remove friend' });
  }
});

router.put('/step-sharing', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { shareStepsEnabled } = req.body as { shareStepsEnabled?: boolean };
    if (typeof shareStepsEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'shareStepsEnabled (boolean) is required',
      });
    }
    const result = await updateStepSharing(req.userId!, shareStepsEnabled);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }
    return res.json({ success: true, shareStepsEnabled: result.shareStepsEnabled });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update step sharing error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update step sharing' });
  }
});


router.patch('/:id/gender', authenticate, async (req: AuthenticatedRequest<IdParams>, res: Response) => {
  const id = routeParam(req.params.id);
  if (!assertSelfOr403(req, id, res)) return;

  const { gender } = req.body as { gender?: string };
  if (!gender || !isValidGender(gender)) {
    return res.status(400).json({ message: 'gender must be Male or Female' });
  }

  try {
    const updatedUser = await updateUser(id, { gender });
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json(toClientUser(updatedUser));
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update gender error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

router.patch('/:id/experience', authenticate, async (req: AuthenticatedRequest<IdParams>, res: Response) => {
  const id = routeParam(req.params.id);
  if (!assertSelfOr403(req, id, res)) return;

  const { experience } = req.body as { experience?: string };
  if (!experience || !isValidExperience(experience)) {
    return res.status(400).json({
      message: 'experience must be one of: Beginner, Intermediate, Advanced, Pro, Elite',
    });
  }

  try {
    const updatedUser = await updateUser(id, { experience });
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json(toClientUser(updatedUser));
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update experience error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

router.patch('/:id/weight', authenticate, async (req: AuthenticatedRequest<IdParams>, res: Response) => {
  const id = routeParam(req.params.id);
  if (!assertSelfOr403(req, id, res)) return;

  const { weight, unit } = req.body as { weight?: number; unit?: string };
  if (weight == null || Number.isNaN(Number(weight)) || Number(weight) <= 0) {
    return res.status(400).json({ message: 'weight must be a positive number' });
  }

  const resolvedUnit = unit === 'lbs' ? 'lbs' : 'kg';

  try {
    const updatedUser = await updateUser(id, {
      weight: Number(weight),
      unit: resolvedUnit,
    });
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json(toClientUser(updatedUser));
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update weight error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

router.put('/:id/username', authenticate, async (req: AuthenticatedRequest<IdParams>, res: Response) => {
  const id = routeParam(req.params.id);
  if (!assertSelfOr403(req, id, res)) return;

  const { username } = req.body as { username?: string };
  if (!username?.trim()) {
    return res.status(400).json({ message: 'username is required' });
  }

  try {
    const updatedUser = await updateUser(id, { username: username.trim() });
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json(toClientUser(updatedUser));
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update username error:', err);
    return res.status(500).json({ message: 'Error updating username' });
  }
});

/** Avatar: multipart file OR JSON `{ "avatar": "https://..." }` for preset icons */
router.put('/:id/avatar', authenticate, upload.single('avatar'), async (req: MulterRequest & AuthenticatedRequest<IdParams>, res: Response) => {
  const id = routeParam(req.params.id);
  if (!assertSelfOr403(req, id, res)) return;

  try {
    if (req.file) {
      const avatarPath = `uploads/avatars/${req.file.filename}`;
      const updatedUser = await updateUser(id, { avatar: avatarPath });
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      const publicPath = avatarPublicPath(avatarPath);
      return res.json({
        status: true,
        message: 'Avatar changed successfully',
        avatar: publicPath,
        success: true,
      });
    }

    const bodyAvatar = (req.body as { avatar?: string })?.avatar;
    if (bodyAvatar && typeof bodyAvatar === 'string' && bodyAvatar.startsWith('http')) {
      const updatedUser = await updateUser(id, { avatar: bodyAvatar.trim() });
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json({
        status: true,
        message: 'Avatar changed successfully',
        avatar: updatedUser.avatar,
        success: true,
      });
    }

    return res.status(400).json({
      success: false,
      error: 'No avatar file provided. Send multipart field "avatar" or JSON { "avatar": "<url>" }',
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Upload avatar error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// --- Profile CRUD (existing; `:userId` alias) ---

router.get('/:userId', authenticate, async (req: AuthenticatedRequest<UserParams>, res: Response) => {
  try {
    const userId = routeParam(req.params.userId);

    if (!assertSelfOr403(req, userId, res)) return;

    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const client = toClientUser(user);
    return res.json(client);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Get user profile error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to get user profile',
      error: err.message,
    });
  }
});

router.put('/:userId', authenticate, async (req: AuthenticatedRequest<UserParams, {}, UpdateUserParams>, res: Response) => {
  try {
    const userId = routeParam(req.params.userId);
    const updateData = { ...req.body };

    if (!assertSelfOr403(req, userId, res)) return;

    delete updateData.password;
    delete updateData.email;
    delete updateData.userId;

    if (updateData.experienceLevel && !updateData.experience) {
      updateData.experience = updateData.experienceLevel;
      delete updateData.experienceLevel;
    }

    const updatedUser = await updateUser(userId, updateData);

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      ...toClientUser(updatedUser),
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update user profile error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user profile',
      error: err.message,
    });
  }
});

export default router;
