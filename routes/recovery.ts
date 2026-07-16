import express, { Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.ts';
import { ensureRecoverySessionIndexes } from '../models/recoverySession.ts';
import {
  getRecoveryProtocolsCatalog,
  getRecoverySessionHistory,
  getRecoverySummary,
  toClientRecoverySession,
  upsertRecoverySession,
} from '../services/recoveryHub.ts';
import {
  resolveSummaryPeriod,
  validateRecoverySessionBody,
} from '../utils/recoveryValidation.ts';
import { isValidPerformanceDate } from '../utils/performanceValidation.ts';

const router = express.Router();

router.use(async (_req, _res, next) => {
  try {
    await ensureRecoverySessionIndexes();
    next();
  } catch (err) {
    next(err);
  }
});

/** Static MVP catalog — also shipable in the app bundle. */
router.get('/protocols', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json({ success: true, data: getRecoveryProtocolsCatalog() });
  } catch (error: unknown) {
    console.error('GET /recovery/protocols error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch recovery protocols' });
  }
});

router.post('/sessions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = validateRecoverySessionBody(
      (req.body || {}) as Record<string, unknown>
    );
    if (parsed.ok === false) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: parsed.errors,
      });
    }

    const saved = await upsertRecoverySession(req.userId!, parsed.input);
    return res.status(parsed.input.sessionId ? 200 : 201).json({
      success: true,
      data: toClientRecoverySession(saved),
    });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    if (err.statusCode === 400 || err.statusCode === 404) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('POST /recovery/sessions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save recovery session' });
  }
});

router.get('/sessions', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limitRaw = req.query.limit;
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : undefined;

    // Accept ISO timestamps or YYYY-MM-DD (expand to day bounds).
    let fromIso = from;
    let toIso = to;
    if (from && isValidPerformanceDate(from)) {
      fromIso = `${from}T00:00:00.000Z`;
    }
    if (to && isValidPerformanceDate(to)) {
      toIso = `${to}T23:59:59.999Z`;
    }

    const limit =
      typeof limitRaw === 'string' && Number(limitRaw) > 0
        ? Math.min(Number(limitRaw), 100)
        : 20;

    const data = await getRecoverySessionHistory(req.userId!, {
      limit,
      from: fromIso,
      to: toIso,
    });

    return res.json({ success: true, data });
  } catch (error: unknown) {
    console.error('GET /recovery/sessions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch recovery sessions' });
  }
});

router.get('/summary', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const period = resolveSummaryPeriod(req.query.period);
    const data = await getRecoverySummary(req.userId!, period);
    return res.json({ success: true, data });
  } catch (error: unknown) {
    console.error('GET /recovery/summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch recovery summary' });
  }
});

export default router;
