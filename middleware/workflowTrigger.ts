import { NextFunction, Request, Response } from 'express';

/**
 * Optional guard for manual/cron triggers without a QStash signature.
 * Real QStash calls include `Upstash-Signature` — those skip this and are verified inside `serve()`.
 */
export function workflowTriggerAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['upstash-signature']) {
    next();
    return;
  }

  const secret = process.env.WORKFLOW_API_SECRET;
  if (!secret) {
    next();
    return;
  }

  const auth = req.headers.authorization;
  const header = req.headers['x-workflow-secret'];

  if (auth === `Bearer ${secret}` || header === secret) {
    next();
    return;
  }

  res.status(401).json({ message: 'Unauthorized workflow trigger' });
}
