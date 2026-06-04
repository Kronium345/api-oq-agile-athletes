import { Router } from 'express';
import {
  sendDailyStepReminders,
  sendLeaderboardAlerts,
  sendMotivationAndGoals,
  sendWeeklyProgressSummary,
} from '../controllers/workflow.controller.ts';
import { workflowTriggerAuth } from '../middleware/workflowTrigger.ts';

const router = Router();

router.use('/daily-step-reminders', workflowTriggerAuth, sendDailyStepReminders);
router.use('/weekly-progress-summary', workflowTriggerAuth, sendWeeklyProgressSummary);
router.use('/leaderboard-alerts', workflowTriggerAuth, sendLeaderboardAlerts);
router.use('/motivation-and-goals', workflowTriggerAuth, sendMotivationAndGoals);

router.get('/status', (_req, res) => {
  res.json({
    ok: true,
    endpoints: [
      'POST /workflow/daily-step-reminders',
      'POST /workflow/weekly-progress-summary',
      'POST /workflow/leaderboard-alerts',
      'POST /workflow/motivation-and-goals',
    ],
    body: { userId: '<uuid userId from register/login>' },
  });
});

export default router;
