import express, { Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.ts';
import { deleteAccountByUserId } from '../models/accountDeletion.ts';
import bcrypt from 'bcryptjs';
import {
  authenticateUser,
  authenticateUserByEmailOrUsername,
  createUser,
  getUserByEmail,
  getUserByUsername,
  updateUser,
} from '../models/user.ts';
import { isEmailConfigured } from '../config/nodemailer.ts';
import { sendPasswordResetEmail } from '../utils/send-email.ts';
import { signAuthToken } from '../utils/jwt.ts';
import { toClientUser } from '../utils/userResponse.ts';

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

interface RegisterRequestBody {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  username?: string;
}

interface LoginRequestBody {
  emailOrUsername: string;
  password: string;
}

function issueToken(userId: string, email: string): string {
  return signAuthToken(userId, email);
}

/** Legacy + app-compatible user payload */
function authPayload(user: Awaited<ReturnType<typeof createUser>>) {
  const client = toClientUser(user);
  return {
    success: true,
    token: issueToken(user.userId, user.email),
    user: client,
    result: client,
  };
}


router.post('/register', async (req: Request<{}, {}, RegisterRequestBody>, res: Response) => {
  try {
    const { firstName, lastName, email, password, username } = req.body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: 'firstName, lastName, email, and password are required' });
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    if (username?.trim()) {
      const existingUsername = await getUserByUsername(username);
      if (existingUsername) {
        return res.status(409).json({ message: 'Username already taken' });
      }
    }

    const user = await createUser({
      name: `${firstName.trim()} ${lastName.trim()}`,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
      username: username?.trim(),
    });

    const client = toClientUser(user);
    return res.status(201).json({
      result: client,
      token: issueToken(user.userId, user.email),
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Something went wrong on the server.', error: err.message });
  }
});

router.post('/login', async (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername?.trim() || !password) {
      return res.status(400).json({ message: 'emailOrUsername and password are required' });
    }

    const authResult = await authenticateUserByEmailOrUsername(emailOrUsername, password);

    if (!authResult.success || !authResult.user) {
      if (authResult.message === 'User not found') {
        return res.status(404).json({ message: 'User not found' });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const client = toClientUser(authResult.user);
    return res.status(200).json({
      result: client,
      token: issueToken(authResult.user.userId, authResult.user.email),
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Something went wrong on the server.', error: err.message });
  }
});

// --- Legacy routes (existing OQ clients) ---

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
    const payload = authPayload(user);

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      token: payload.token,
      user: payload.user,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Sign up error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to sign up',
      error: err.message,
    });
  }
});

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

    const client = toClientUser(authResult.user);

    return res.json({
      success: true,
      message: 'Sign in successful',
      token: issueToken(authResult.user.userId, authResult.user.email),
      user: client,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Sign in error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to sign in',
      error: err.message,
    });
  }
});

router.get('/current-user', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const client = toClientUser(user);

    res.json({
      success: true,
      user: client,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Get current user error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to get user',
      error: err.message,
    });
  }
});

router.post('/forgotpassword', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };

  if (!email?.trim()) {
    return res.status(400).json({ message: 'Email is required' });
  }

  if (!isEmailConfigured()) {
    return res.status(500).json({ message: 'Email service not configured' });
  }

  try {
    const user = await getUserByEmail(email.trim());
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email' });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await updateUser(user.userId, { resetCode, resetCodeExpires });

    await sendPasswordResetEmail(user.email, resetCode);

    const exposeCode =
      process.env.NODE_ENV !== 'production' || process.env.EMAIL_EXPOSE_RESET_CODE === 'true';

    return res.status(200).json({
      message: 'Reset code has been sent to your email',
      ...(exposeCode ? { resetCode } : {}),
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Forgot password error:', err);
    return res.status(500).json({ message: 'Failed to send reset code email' });
  }
});

router.post('/resetpassword', async (req: Request, res: Response) => {
  const { email, resetCode, newPassword } = req.body as {
    email?: string;
    resetCode?: string;
    newPassword?: string;
  };

  if (!email?.trim() || !resetCode?.trim() || !newPassword) {
    return res.status(400).json({ message: 'email, resetCode, and newPassword are required' });
  }

  try {
    const user = await getUserByEmail(email.trim());
    if (
      !user ||
      user.resetCode !== resetCode.trim() ||
      !user.resetCodeExpires ||
      new Date(user.resetCodeExpires).getTime() < Date.now()
    ) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await updateUser(user.userId, {
      password: hashedPassword,
      resetCode: null,
      resetCodeExpires: null,
    });

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Reset password error:', err);
    return res.status(500).json({ message: 'Error resetting password' });
  }
});

router.delete('/delete', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    await deleteAccountByUserId(userId);
    return res.status(204).send();
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Delete account error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete account',
    });
  }
});

export default router;
