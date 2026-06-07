import type { NextFunction, Response } from 'express';
import { countFormAnalysesSince } from '../models/formAnalysis.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';

const DEFAULT_MAX = Number(process.env.FORM_COACH_RATE_LIMIT_PER_HOUR || 10);
const WINDOW_MS = 60 * 60 * 1000;

export async function formCoachRateLimiter(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (process.env.FORM_COACH_RATE_LIMIT_DISABLED === 'true') {
    next();
    return;
  }

  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const count = await countFormAnalysesSince(userId, since);

    if (count >= DEFAULT_MAX) {
      res.status(429).json({
        success: false,
        error: `Analysis limit reached (${DEFAULT_MAX} per hour). Try again later.`,
        retryAfterSeconds: 3600,
      });
      return;
    }

    next();
  } catch (err) {
    console.error('[form-coach] rate limit check failed:', (err as Error).message);
    next();
  }
}
