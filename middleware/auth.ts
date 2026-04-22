import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '@clerk/backend';
import { getUserById } from '../models/user.js';

interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: any;
  userId?: string;
}

const BEARER_PREFIX = 'Bearer ';

async function authenticate(req: AuthenticatedRequest<any, any, any, any>, res: Response, next: NextFunction): Promise<void> {
  try {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    if (!clerkSecretKey) {
      console.error('CLERK_SECRET_KEY is not configured');
      res.status(500).json({
        success: false,
        message: 'Authentication is not configured',
      });
      return;
    }

    const token = authHeader.slice(BEARER_PREFIX.length).trim();
    const payload = await verifyToken(token, { secretKey: clerkSecretKey });
    const clerkUserId = payload.sub;

    if (!clerkUserId) {
      res.status(401).json({
        success: false,
        message: 'Token has no subject',
      });
      return;
    }

    const user = await getUserById(clerkUserId);
    req.userId = clerkUserId;
    req.user = user || { userId: clerkUserId };
    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error?.message || error);
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
    });
  }
}

export { authenticate, type AuthenticatedRequest };

