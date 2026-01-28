import express, { Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import {
    getStepHistory,
    getStepsByDate,
    getTotalSteps,
    recordSteps,
    updateSteps,
} from '../models/stepHistory.js';

const router = express.Router();

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
    const { date } = req.params;
    const userId = req.userId!;

    const steps = await getStepsByDate(userId, date);

    res.json({
      success: true,
      data: steps,
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
      data: { totalSteps: total },
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
    const { date } = req.params;
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
