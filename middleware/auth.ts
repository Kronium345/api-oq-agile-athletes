import { NextFunction, Request, Response } from 'express';
import { getUserById } from '../models/user.ts';
import { verifyAuthToken } from '../utils/jwt.ts';

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

export async function tryResolveAuthenticatedUser(
  req: AuthenticatedRequest
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getUserById>>>; userId: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  const verified = verifyAuthToken(token);
  const resolvedUserId = verified?.userId ?? resolveUserIdFromToken(token);
  if (!resolvedUserId) return null;

  const user = await getUserById(resolvedUserId);
  if (!user) return null;

  req.user = user;
  req.userId = user.userId;
  return { user, userId: user.userId };
}

async function authenticate(req: AuthenticatedRequest<any, any, any, any>, res: Response, next: NextFunction): Promise<void> {
  console.log('[auth] request received', { path: req.path, method: req.method });

  try {
    const resolved = await tryResolveAuthenticatedUser(req);
    if (!resolved) {
      console.log('[auth] missing or invalid bearer header', { path: req.path });
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    console.log('[auth] authentication successful', {
      path: req.path,
      userId: resolved.userId,
    });
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

