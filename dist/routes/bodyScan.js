import express from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate } from "../middleware/auth.js";
import { ensureBodyScanIndexes, getLatestBodyScanForUser, listBodyScansForUser, saveBodyScan, } from "../models/bodyScan.js";
import { getUserById } from "../models/user.js";
import { checkBodyScanReady, FormCoachError, MAX_BODY_SCAN_IMAGE_BYTES, submitBodyScan, } from "../services/formCoachClient.js";
import { bodyScanRateLimiter } from "../utils/bodyScanRateLimit.js";
const router = express.Router();
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_MIMES = /^(image\/(jpeg|jpg|png|webp)|application\/octet-stream)$/i;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BODY_SCAN_IMAGE_BYTES },
    fileFilter(_req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED_MIMES.test(file.mimetype) || ALLOWED_EXTENSIONS.has(ext)) {
            cb(null, true);
            return;
        }
        cb(new Error('Invalid image type. Allowed: .jpg, .jpeg, .png, .webp'));
    },
});
function isBodyScanEnabled() {
    return process.env.BODY_SCAN_ENABLED !== 'false';
}
router.use(async (_req, _res, next) => {
    try {
        await ensureBodyScanIndexes();
        next();
    }
    catch (err) {
        next(err);
    }
});
function toClientScan(record) {
    return {
        id: record.scanId,
        createdAt: record.createdAt,
        bodyFatPercent: record.bodyFatPercent,
        bmi: record.bmi,
        measurementsCm: record.measurementsCm,
        confidence: record.confidence,
        warnings: record.warnings,
        disclaimer: record.disclaimer,
        usedSideView: record.usedSideView,
        heightCm: record.heightCm,
        weightKg: record.weightKg,
        age: record.age,
        sex: record.sex,
    };
}
function parseOptionalNumber(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    return Number.isFinite(n) ? n : undefined;
}
function normalizeSex(raw) {
    if (typeof raw !== 'string')
        return null;
    const v = raw.trim().toLowerCase();
    if (v === 'male' || v === 'm')
        return 'male';
    if (v === 'female' || v === 'f')
        return 'female';
    return null;
}
function weightToKg(weight, unit) {
    const u = (unit || 'kg').toLowerCase();
    if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') {
        return Math.round(weight * 0.45359237 * 10) / 10;
    }
    return weight;
}
function validateInputs(params) {
    const { heightCm, weightKg, age, sex } = params;
    if (heightCm === undefined || weightKg === undefined || age === undefined || !sex) {
        return {
            ok: false,
            error: 'height_cm, weight_kg, age, and sex (male|female) are required',
        };
    }
    if (heightCm < 120 || heightCm > 230) {
        return { ok: false, error: 'height_cm must be between 120 and 230' };
    }
    if (weightKg < 30 || weightKg > 300) {
        return { ok: false, error: 'weight_kg must be between 30 and 300' };
    }
    if (age < 16 || age > 90) {
        return { ok: false, error: 'age must be between 16 and 90' };
    }
    return { ok: true };
}
router.get('/health', async (_req, res) => {
    try {
        if (!isBodyScanEnabled()) {
            return res.json({
                success: true,
                enabled: false,
                ready: false,
                message: 'Body scan is disabled on this server',
            });
        }
        const ready = await checkBodyScanReady();
        return res.json({
            success: true,
            enabled: true,
            ready,
            message: ready
                ? 'Body scan available'
                : 'Form Coach is waking up or unreachable — scans may fail until ready',
        });
    }
    catch (error) {
        console.error('[body-scan] health error:', error);
        return res.status(502).json({
            success: false,
            enabled: isBodyScanEnabled(),
            ready: false,
            error: 'Body scan health check failed',
        });
    }
});
router.get('/history', authenticate, async (req, res) => {
    try {
        const limitRaw = req.query.limit;
        const limit = typeof limitRaw === 'string' && Number(limitRaw) > 0 ? Number(limitRaw) : 20;
        const scans = await listBodyScansForUser(req.userId, limit);
        return res.json({
            success: true,
            scans: scans.map(toClientScan),
        });
    }
    catch (error) {
        console.error('[body-scan] history error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch body scan history' });
    }
});
router.get('/latest', authenticate, async (req, res) => {
    try {
        const scan = await getLatestBodyScanForUser(req.userId);
        return res.json({
            success: true,
            scan: scan ? toClientScan(scan) : null,
        });
    }
    catch (error) {
        console.error('[body-scan] latest error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch latest body scan' });
    }
});
router.post('/', authenticate, (req, res, next) => {
    if (!isBodyScanEnabled()) {
        return res.status(503).json({
            success: false,
            error: 'Body scan is temporarily disabled',
        });
    }
    next();
}, bodyScanRateLimiter, (req, res, next) => {
    upload.fields([
        { name: 'front_image', maxCount: 1 },
        { name: 'side_image', maxCount: 1 },
    ])(req, res, (err) => {
        if (err) {
            const multerErr = err;
            if (multerErr.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    success: false,
                    error: 'Image exceeds the 15MB size limit.',
                });
            }
            return res.status(400).json({
                success: false,
                error: multerErr.message || 'Invalid image upload',
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        const files = req.files;
        const front = files?.front_image?.[0];
        if (!front) {
            return res.status(400).json({
                success: false,
                error: 'front_image is required',
            });
        }
        const user = await getUserById(req.userId);
        let heightCm = parseOptionalNumber(req.body?.height_cm);
        let weightKg = parseOptionalNumber(req.body?.weight_kg);
        let age = parseOptionalNumber(req.body?.age);
        let sex = normalizeSex(req.body?.sex);
        // Prefill from profile when omitted (height/age usually still required from client).
        if (weightKg === undefined && typeof user?.weight === 'number') {
            weightKg = weightToKg(user.weight, user.unit);
        }
        if (!sex && user?.gender) {
            sex = normalizeSex(user.gender);
        }
        if (heightCm === undefined) {
            heightCm = parseOptionalNumber(user?.heightCm ?? user?.height_cm);
        }
        if (age === undefined) {
            age = parseOptionalNumber(user?.age);
        }
        const validated = validateInputs({ heightCm, weightKg, age, sex });
        if (validated.ok === false) {
            return res.status(400).json({ success: false, error: validated.error });
        }
        const side = files?.side_image?.[0];
        const result = await submitBodyScan({
            frontImage: {
                buffer: front.buffer,
                filename: front.originalname || 'front.jpg',
                contentType: front.mimetype,
            },
            sideImage: side
                ? {
                    buffer: side.buffer,
                    filename: side.originalname || 'side.jpg',
                    contentType: side.mimetype,
                }
                : undefined,
            heightCm: heightCm,
            weightKg: weightKg,
            age: age,
            sex: sex,
        });
        const saved = await saveBodyScan({
            userId: req.userId,
            heightCm: heightCm,
            weightKg: weightKg,
            age: age,
            sex: sex,
            usedSideView: Boolean(side),
            result,
        });
        // Pass through Form Coach medical fields; also return saved history shape.
        return res.json({
            success: true,
            ...result,
            scan: toClientScan(saved),
        });
    }
    catch (error) {
        if (error instanceof FormCoachError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                details: error.details,
            });
        }
        console.error('[body-scan] proxy error:', error);
        return res.status(502).json({
            success: false,
            error: 'Unable to reach Form Coach body-scan service',
        });
    }
});
export default router;
