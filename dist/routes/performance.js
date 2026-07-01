import express from 'express';
import { authenticate } from "../middleware/auth.js";
import { ensurePerformanceCheckinIndexes } from "../models/performanceCheckin.js";
import { getPerformanceCheckInHistory, getPerformanceToday, getPerformanceTrends, getPerformanceWeeklySummary, resolveTrendPeriod, resolveWeekStart, submitPerformanceCheckIn, } from "../services/performanceHub.js";
import { isValidPerformanceDate, validateCheckInBody } from "../utils/performanceValidation.js";
import { todayUtc } from "../utils/stepDates.js";
const router = express.Router();
router.use(async (_req, _res, next) => {
    try {
        await ensurePerformanceCheckinIndexes();
        next();
    }
    catch (err) {
        next(err);
    }
});
router.post('/check-ins', authenticate, async (req, res) => {
    try {
        const parsed = validateCheckInBody(req.body);
        if (parsed.ok === false) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: parsed.errors,
            });
        }
        const data = await submitPerformanceCheckIn(req.userId, parsed.inputs);
        return res.json({ success: true, data });
    }
    catch (error) {
        console.error('POST /performance/check-ins error:', error);
        return res.status(500).json({ success: false, message: 'Failed to save performance check-in' });
    }
});
router.get('/today', authenticate, async (req, res) => {
    try {
        const dateRaw = req.query.date;
        const date = typeof dateRaw === 'string' && isValidPerformanceDate(dateRaw.trim())
            ? dateRaw.trim()
            : todayUtc();
        const data = await getPerformanceToday(req.userId, date);
        return res.json({ success: true, data });
    }
    catch (error) {
        console.error('GET /performance/today error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch performance dashboard' });
    }
});
router.get('/check-ins', authenticate, async (req, res) => {
    try {
        const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : undefined;
        const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : undefined;
        const limitRaw = req.query.limit;
        if (startDate && !isValidPerformanceDate(startDate)) {
            return res.status(400).json({ success: false, message: 'startDate must be YYYY-MM-DD' });
        }
        if (endDate && !isValidPerformanceDate(endDate)) {
            return res.status(400).json({ success: false, message: 'endDate must be YYYY-MM-DD' });
        }
        if (startDate && endDate && startDate > endDate) {
            return res.status(400).json({ success: false, message: 'startDate must be on or before endDate' });
        }
        const limit = typeof limitRaw === 'string' && Number(limitRaw) > 0
            ? Math.min(Number(limitRaw), 90)
            : startDate && endDate
                ? undefined
                : 7;
        const data = await getPerformanceCheckInHistory(req.userId, {
            limit,
            startDate,
            endDate,
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        console.error('GET /performance/check-ins error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch check-in history' });
    }
});
router.get('/trends', authenticate, async (req, res) => {
    try {
        const period = resolveTrendPeriod(req.query.period);
        const data = await getPerformanceTrends(req.userId, period);
        return res.json({ success: true, data });
    }
    catch (error) {
        console.error('GET /performance/trends error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch performance trends' });
    }
});
router.get('/weekly-summary', authenticate, async (req, res) => {
    try {
        const weekStartRaw = req.query.weekStart;
        const weekStart = resolveWeekStart(typeof weekStartRaw === 'string' ? weekStartRaw.trim() : undefined);
        const data = await getPerformanceWeeklySummary(req.userId, weekStart);
        return res.json({ success: true, data });
    }
    catch (error) {
        console.error('GET /performance/weekly-summary error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch weekly summary' });
    }
});
export default router;
