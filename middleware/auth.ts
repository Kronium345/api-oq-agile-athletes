import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '@clerk/backend';
import { getUserById } from '../models/user.js';

interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: any;
  userId?: string;
}

const BEARER_PREFIX = 'Bearer ';

function parseCsvEnv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildUnauthorizedResponse(res: Response, message: string, reason: string): void {
  res.status(401).json({
    success: false,
    message,
    reason,
  });
}

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
    const expectedIssuer = process.env.CLERK_ISSUER?.trim();
    const expectedAudiences = parseCsvEnv(process.env.CLERK_AUDIENCE);
    const expectedAuthorizedParties = parseCsvEnv(process.env.CLERK_AUTHORIZED_PARTIES);

    if (!clerkUserId) {
      buildUnauthorizedResponse(res, 'Token has no subject', 'missing_sub');
      return;
    }

    if (expectedIssuer && payload.iss !== expectedIssuer) {
      buildUnauthorizedResponse(res, 'Token issuer mismatch', 'issuer_mismatch');
      return;
    }

    const audienceClaim = payload.aud;
    const tokenAudiences = Array.isArray(audienceClaim)
      ? audienceClaim
      : typeof audienceClaim === 'string'
        ? [audienceClaim]
        : [];

    if (expectedAudiences.length > 0) {
      const hasMatchingAudience = expectedAudiences.some((aud) => tokenAudiences.includes(aud));
      if (!hasMatchingAudience) {
        buildUnauthorizedResponse(res, 'Token audience mismatch', 'audience_mismatch');
        return;
      }
    }

    const tokenAzp = typeof payload.azp === 'string' ? payload.azp : '';
    if (expectedAuthorizedParties.length > 0 && !expectedAuthorizedParties.includes(tokenAzp)) {
      buildUnauthorizedResponse(res, 'Token authorized party mismatch', 'azp_mismatch');
      return;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const tokenExp = typeof payload.exp === 'number' ? payload.exp : 0;
    if (!tokenExp || tokenExp <= nowInSeconds) {
      buildUnauthorizedResponse(res, 'Token has expired', 'token_expired');
      return;
    }

    const user = await getUserById(clerkUserId);
    req.userId = clerkUserId;
    req.user = user || { userId: clerkUserId };
    next();
  } catch (error: any) {
    const errorMessage = String(error?.message || '').toLowerCase();
    const reason = errorMessage.includes('expired')
      ? 'token_expired'
      : errorMessage.includes('malformed')
        ? 'malformed_token'
        : errorMessage.includes('invalid')
          ? 'invalid_token'
          : 'token_verification_failed';

    console.error('Auth middleware error:', error?.message || error);
    buildUnauthorizedResponse(res, 'Authentication failed', reason);
  }
}

export { authenticate, type AuthenticatedRequest };

