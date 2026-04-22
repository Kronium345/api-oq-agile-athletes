import express, { Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { authenticateUser, createUser, getUserByEmail } from '../models/user.js';

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
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and password are required',
      });
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already in use',
      });
    }

    const user = await createUser({ name, email, password });
    const userWithId: UserWithTemplateId = {
      ...user,
      _id: user.userId,
    };

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      token: user.userId,
      user: userWithId,
    });
  } catch (error: any) {
    console.error('Sign up error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sign up',
      error: error.message,
    });
  }
});

/**
 * Sign in - Authenticate user
 */
router.post('/signin', async (req: Request<{}, {}, SignInRequestBody>, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required',
      });
    }

    const authResult = await authenticateUser(email, password);

    if (!authResult.success || !authResult.user) {
      return res.status(401).json({
        success: false,
        message: authResult.message || 'Invalid credentials',
      });
    }

    const userWithId: UserWithTemplateId = {
      ...authResult.user,
      _id: authResult.user.userId,
    };

    return res.json({
      success: true,
      message: 'Sign in successful',
      token: authResult.user.userId,
      user: userWithId,
    });
  } catch (error: any) {
    console.error('Sign in error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sign in',
      error: error.message,
    });
  }
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
