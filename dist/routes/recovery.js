import express from 'express';
import { authenticate } from "../middleware/auth.js";
import { ensureRecoverySessionIndexes } from "../models/recoverySession.js";
import { getRecoveryProtocolsCatalog, getRecoverySessionHistory, getRecoverySummary, toClientRecoverySession, upsertRecoverySession, } from "../services/recoveryHub.js";
import { resolveSummaryPeriod, validateRecoverySessionBody, } from "../utils/recoveryValidation.js";
import { isValidPerformanceDate } from "../utils/performanceValidation.js";
const router = express.Router();
router.use(async (_req, _res, next) => {
    try {
        await ensureRecoverySessionIndexes();
        next();
    }
    catch (err) {
        next(err);
    }
});
/** Static MVP catalog — also shipable in the app bundle. */
router.get('/protocols', authenticate, async (_req, res) => {
    try {
        return res.json({ success: true, data: getRecoveryProtocolsCatalog() });
    }
    catch (error) {
        console.error('GET /recovery/protocols error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch recovery protocols' });
    }
});
router.post('/sessions', authenticate, async (req, res) => {
    try {
        const parsed = validateRecoverySessionBody((req.body || {}));
        if (parsed.ok === false) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: parsed.errors,
            });
        }
        const saved = await upsertRecoverySession(req.userId, parsed.input);
        return res.status(parsed.input.sessionId ? 200 : 201).json({
            success: true,
            data: toClientRecoverySession(saved),
        });
    }
    catch (error) {
        const err = error;
        if (err.statusCode === 400 || err.statusCode === 404) {
            return res.status(err.statusCode).json({ success: false, message: err.message });
        }
        console.error('POST /recovery/sessions error:', error);
        return res.status(500).json({ success: false, message: 'Failed to save recovery session' });
    }
});
router.get('/sessions', authenticate, async (req, res) => {
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
        const limit = typeof limitRaw === 'string' && Number(limitRaw) > 0
            ? Math.min(Number(limitRaw), 100)
            : 20;
        const data = await getRecoverySessionHistory(req.userId, {
            limit,
            from: fromIso,
            to: toIso,
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        console.error('GET /recovery/sessions error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch recovery sessions' });
    }
});
router.get('/summary', authenticate, async (req, res) => {
    try {
        const period = resolveSummaryPeriod(req.query.period);
        const data = await getRecoverySummary(req.userId, period);
        return res.json({ success: true, data });
    }
    catch (error) {
        console.error('GET /recovery/summary error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch recovery summary' });
    }
});
export default router;
