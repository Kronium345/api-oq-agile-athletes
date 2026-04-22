import { NextFunction, Request, Response } from 'express';
import { getUserById } from '../models/user.js';

interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: any;
  userId?: string;
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadBase64 + '='.repeat((4 - (payloadBase64.length % 4)) % 4);
    const payloadJson = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

function resolveUserIdFromToken(token: string): string | null {
  const jwtPayload = decodeJwtPayload(token);
  if (jwtPayload) {
    const jwtUserId =
      jwtPayload.sub ||
      jwtPayload.userId ||
      jwtPayload.user_id ||
      jwtPayload.uid ||
      jwtPayload.id;

    if (typeof jwtUserId === 'string' && jwtUserId.trim()) {
      return jwtUserId.trim();
    }
  }

  return token.trim() || null;
}

async function authenticate(req: AuthenticatedRequest<any, any, any, any>, res: Response, next: NextFunction): Promise<void> {
  console.log('[auth] request received', { path: req.path, method: req.method });
  
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[auth] missing or invalid bearer header', { path: req.path });
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    const resolvedUserId = resolveUserIdFromToken(token);

    if (!resolvedUserId) {
      console.log('[auth] unable to resolve user id from token', { path: req.path });
      res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
      return;
    }

    console.log('[auth] resolved user id', { path: req.path, userId: resolvedUserId });
    const user = await getUserById(resolvedUserId);
    
    if (!user) {
      console.log('[auth] user not found for token', { path: req.path, userId: resolvedUserId });
      res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
      return;
    }

    console.log('[auth] authentication successful', { path: req.path, userId: user.userId });
    req.user = user;
    req.userId = user.userId;
    next();
  } catch (error: any) {
    console.error('[auth] authentication error', {
      path: req.path,
      message: error?.message,
    });
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
    });
  }
}

export { authenticate, type AuthenticatedRequest };

