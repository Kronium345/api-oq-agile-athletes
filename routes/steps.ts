import express, { Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.ts';
import {
  ensureStepHistoryIndexes,
  getStepHistory,
  getStepsByDate,
  getTotalSteps,
  isValidStepDate,
  recordSteps,
} from '../models/stepHistory.ts';
import { getLeaderboard, type LeaderboardPeriod, type LeaderboardScope } from '../services/stepsSocial.ts';
import { toDailyStepRow } from '../utils/stepResponse.ts';
import { routeParam } from '../utils/routeParams.ts';

const router = express.Router();

router.use(async (_req, _res, next) => {
  try {
    await ensureStepHistoryIndexes();
    next();
  } catch (err) {
    next(err);
  }
});

function parseLeaderboardPeriod(value: unknown): LeaderboardPeriod {
  if (value === 'streaks' || value === 'today' || value === 'week') return value;
  return 'today';
}

function parseLeaderboardScope(value: unknown): LeaderboardScope {
  if (value === 'all' || value === 'friends') return value;
  return 'friends';
}

interface StepsRequestBody {
  date: string;
  stepCount: number;
}

interface UpdateStepsRequestBody {
  stepCount: number;
}

interface StepsParams {
  date: string;
}

interface StepsQuery {
  startDate?: string;
  endDate?: string;
}

router.get('/leaderboard', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const period = parseLeaderboardPeriod(req.query.period);
    const scope = parseLeaderboardScope(req.query.scope);
    const limitRaw = req.query.limit;
    const limit =
      typeof limitRaw === 'string' && Number(limitRaw) > 0
        ? Math.min(Number(limitRaw), 100)
        : 12;

    const { entries } = await getLeaderboard(req.userId!, period, scope, limit);
    return res.json({ success: true, period, scope, entries });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Leaderboard error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch leaderboard' });
  }
});

router.post('/', authenticate, async (req: AuthenticatedRequest<{}, {}, StepsRequestBody>, res: Response) => {
  try {
    const { date, stepCount } = req.body;
    const userId = req.userId!;

    if (!date || stepCount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Date and stepCount are required',
      });
    }

    if (!isValidStepDate(date)) {
      return res.status(400).json({
        success: false,
        message: 'Date must be in YYYY-MM-DD format',
      });
    }

    const result = await recordSteps(userId, date, stepCount);
    const count = result.stepCount ?? 0;

    res.json({
      success: true,
      message: 'Steps recorded successfully',
      stepCount: count,
      data: { date, stepCount: count },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Record steps error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to record steps',
      error: err.message,
    });
  }
});

router.get('/date/:date', authenticate, async (req: AuthenticatedRequest<StepsParams>, res: Response) => {
  try {
    const date = routeParam(req.params.date);
    const userId = req.userId!;

    if (!isValidStepDate(date)) {
      return res.status(400).json({ success: false, message: 'Date must be in YYYY-MM-DD format' });
    }

    const steps = await getStepsByDate(userId, date);
    const stepCount = steps?.stepCount ?? 0;

    res.json({
      success: true,
      stepCount,
      data: { stepCount, date },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Get steps by date error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to get steps',
      error: err.message,
    });
  }
});

router.get('/history', authenticate, async (req: AuthenticatedRequest<{}, {}, {}, StepsQuery>, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.userId!;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate query parameters are required',
      });
    }

    if (!isValidStepDate(startDate) || !isValidStepDate(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate must be YYYY-MM-DD',
      });
    }

    const rows = await getStepHistory(userId, startDate, endDate);
    const history = rows.map(toDailyStepRow).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      history,
      data: history,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Get step history error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to get step history',
      error: err.message,
    });
  }
});

router.get('/total', authenticate, async (req: AuthenticatedRequest<{}, {}, {}, StepsQuery>, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.userId!;

    if (startDate && !isValidStepDate(startDate)) {
      return res.status(400).json({ success: false, message: 'startDate must be YYYY-MM-DD' });
    }
    if (endDate && !isValidStepDate(endDate)) {
      return res.status(400).json({ success: false, message: 'endDate must be YYYY-MM-DD' });
    }

    const totalSteps = await getTotalSteps(
      userId,
      startDate || null,
      endDate || null
    );

    res.json({
      success: true,
      totalSteps,
      data: { totalSteps },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Get total steps error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to get total steps',
      error: err.message,
    });
  }
});

/** Upsert daily step count for the authenticated user (local calendar date). */
router.put('/:date', authenticate, async (req: AuthenticatedRequest<StepsParams, {}, UpdateStepsRequestBody>, res: Response) => {
  try {
    const date = routeParam(req.params.date);
    const { stepCount } = req.body;
    const userId = req.userId!;

    if (!isValidStepDate(date)) {
      return res.status(400).json({
        success: false,
        message: 'Date must be in YYYY-MM-DD format',
      });
    }

    if (stepCount === undefined || Number.isNaN(Number(stepCount))) {
      return res.status(400).json({
        success: false,
        message: 'stepCount (number) is required',
      });
    }

    const result = await recordSteps(userId, date, Number(stepCount));
    const count = result.stepCount ?? 0;

    res.json({
      success: true,
      stepCount: count,
      data: { date, stepCount: count },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update steps error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update steps',
      error: err.message,
    });
  }
});

export default router;
