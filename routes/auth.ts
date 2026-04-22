import express, { Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();

interface SignUpRequestBody {
  name: string;
  email: string;
  password: string;
}

interface SignInRequestBody {
  email: string;
  password: string;
}

interface UserWithTemplateId {
  userId: string;
  _id: string;
  email: string;
  name: string;
  [key: string]: any;
}

router.post('/signup', async (req: Request<{}, {}, SignUpRequestBody>, res: Response) => {
  res.status(410).json({
    success: false,
    message: 'This endpoint is disabled. Use Clerk sign-up on the frontend.',
  });
});

/**
 * Sign in - Authenticate user
 */
router.post('/signin', async (req: Request<{}, {}, SignInRequestBody>, res: Response) => {
  res.status(410).json({
    success: false,
    message: 'This endpoint is disabled. Use Clerk sign-in on the frontend.',
  });
});

/**
 * Get current user
 */
router.get('/current-user', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;

    // Add _id field to match template expectations
    const userWithId: UserWithTemplateId = {
      ...user,
      _id: user.userId
    };

    res.json({
      success: true,
      user: userWithId,
    });
  } catch (error: any) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user',
      error: error.message,
    });
  }
});

export default router;
