import type { NextFunction, Response } from 'express';
import { countBodyScansSince } from '../models/bodyScan.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';

const DEFAULT_MAX = Number(process.env.BODY_SCAN_RATE_LIMIT_PER_DAY || 8);
const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function bodyScanRateLimiter(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (process.env.BODY_SCAN_RATE_LIMIT_DISABLED === 'true') {
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
    const count = await countBodyScansSince(userId, since);
    const max = Number.isFinite(DEFAULT_MAX) && DEFAULT_MAX > 0 ? DEFAULT_MAX : 8;

    if (count >= max) {
      res.status(429).json({
        success: false,
        error: `Body scan limit reached (${max} per day). Try again tomorrow.`,
        retryAfterSeconds: 86_400,
      });
      return;
    }

    next();
  } catch (err) {
    console.error('[body-scan] rate limit check failed:', (err as Error).message);
    next();
  }
}
