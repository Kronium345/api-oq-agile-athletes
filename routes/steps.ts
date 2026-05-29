import express, { Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.ts';
import {
    getStepHistory,
    getStepsByDate,
    getTotalSteps,
    recordSteps,
    updateSteps,
} from '../models/stepHistory.ts';
import { getLeaderboard, type LeaderboardPeriod, type LeaderboardScope } from '../services/stepsSocial.ts';
import { routeParam } from '../utils/routeParams.ts';

const router = express.Router();

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
    return res.json({ success: true, period, entries });
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

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Date must be in YYYY-MM-DD format',
      });
    }

    const result = await recordSteps(userId, date, stepCount);

    res.json({
      success: true,
      message: 'Steps recorded successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('Record steps error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record steps',
      error: error.message,
    });
  }
});

/**
 * Get steps for a specific date
 */
router.get('/date/:date', authenticate, async (req: AuthenticatedRequest<StepsParams>, res: Response) => {
  try {
    const date = routeParam(req.params.date);
    const userId = req.userId!;

    const steps = await getStepsByDate(userId, date);
    const stepCount = steps?.stepCount ?? 0;

    res.json({
      success: true,
      stepCount,
    });
  } catch (error: any) {
    console.error('Get steps by date error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get steps',
      error: error.message,
    });
  }
});

/**
 * Get step history within a date range
 */
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

    const history = await getStepHistory(userId, startDate, endDate);

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    console.error('Get step history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get step history',
      error: error.message,
    });
  }
});

/**
 * Get total steps (all time or within date range)
 */
router.get('/total', authenticate, async (req: AuthenticatedRequest<{}, {}, {}, StepsQuery>, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.userId!;

    const total = await getTotalSteps(
      userId,
      startDate || null,
      endDate || null
    );

    res.json({
      success: true,
      totalSteps: total,
    });
  } catch (error: any) {
    console.error('Get total steps error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get total steps',
      error: error.message,
    });
  }
});

/**
 * Update steps for a specific date
 */
router.put('/:date', authenticate, async (req: AuthenticatedRequest<StepsParams, {}, UpdateStepsRequestBody>, res: Response) => {
  try {
    const date = routeParam(req.params.date);
    const { stepCount } = req.body;
    const userId = req.userId!;

    if (stepCount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'stepCount is required',
      });
    }

    const result = await updateSteps(userId, date, stepCount);

    res.json({
      success: true,
      message: 'Steps updated successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('Update steps error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update steps',
      error: error.message,
    });
  }
});

export default router;
