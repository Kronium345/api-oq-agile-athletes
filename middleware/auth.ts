import { NextFunction, Request, Response } from 'express';
import { getUserById } from '../models/user.js';

interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: any;
  userId?: string;
}

async function authenticate(req: AuthenticatedRequest<any, any, any, any>, res: Response, next: NextFunction): Promise<void> {
  console.log('=== AUTH MIDDLEWARE: Starting authentication ===');
  console.log('Request headers:', req.headers);
  console.log('Authorization header:', req.headers.authorization);
  
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('=== AUTH MIDDLEWARE: No valid auth header ===');
      console.log('Auth header:', authHeader);
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    console.log('=== AUTH MIDDLEWARE: Extracted token ===');
    console.log('Token (first 20 chars):', token ? token.substring(0, 20) + '...' : 'null');
    
    // The current implementation treats the token as the userId directly
    // For now, let's treat the token as the userId directly (this matches our auth system)
    console.log('=== AUTH MIDDLEWARE: Looking up user by token as userId ===');
    const user = await getUserById(token);
    console.log('=== AUTH MIDDLEWARE: User lookup result ===');
    console.log('User found:', !!user);
    console.log('User data:', user ? { userId: user.userId, email: user.email } : 'null');
    
    if (!user) {
      console.log('=== AUTH MIDDLEWARE: User not found ===');
      res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
      return;
    }

    console.log('=== AUTH MIDDLEWARE: Authentication successful ===');
    console.log('Setting req.userId to:', user.userId);
    req.user = user;
    req.userId = user.userId;
    next();
  } catch (error: any) {
    console.error('=== AUTH MIDDLEWARE: Error occurred ===');
    console.error('Auth middleware error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
    });
  }
}

export { authenticate, type AuthenticatedRequest };

