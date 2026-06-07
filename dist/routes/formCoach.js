import express from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate } from "../middleware/auth.js";
import { ensureFormAnalysisIndexes, listFormAnalysesForUser, saveFormAnalysis } from "../models/formAnalysis.js";
import { analyzeFormVideo, fetchVideoFromUrl, FormCoachError, getFormCoachHealth, MAX_VIDEO_BYTES, } from "../services/formCoachClient.js";
import { formCoachRateLimiter } from "../utils/formCoachRateLimit.js";
const router = express.Router();
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv']);
const ALLOWED_MIMES = /^(video\/(mp4|quicktime|x-msvideo|avi|mkv|webm)|application\/octet-stream)$/i;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_VIDEO_BYTES },
    fileFilter(_req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const mimeOk = ALLOWED_MIMES.test(file.mimetype);
        const extOk = ALLOWED_EXTENSIONS.has(ext);
        if (mimeOk || extOk) {
            cb(null, true);
            return;
        }
        cb(new Error('Invalid video type. Allowed: .mp4, .mov, .avi, .mkv'));
    },
});
router.use(async (_req, _res, next) => {
    try {
        await ensureFormAnalysisIndexes();
        next();
    }
    catch (err) {
        next(err);
    }
});
function normalizeExercise(value) {
    const exercise = typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'squat';
    if (exercise !== 'squat') {
        throw new FormCoachError(`Unsupported exercise "${exercise}". MVP supports: squat`, 400);
    }
    return exercise;
}
function toClientAnalysis(record) {
    return {
        id: record.analysisId,
        exercise: record.exercise,
        score: record.score,
        issues: record.issues,
        joint_angles: record.jointAngles,
        analyzedAt: record.createdAt,
        videoUrl: record.videoUrl,
    };
}
router.get('/health', async (_req, res) => {
    try {
        const health = await getFormCoachHealth();
        return res.json({ success: true, ...health });
    }
    catch (error) {
        if (error instanceof FormCoachError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                details: error.details,
            });
        }
        console.error('[form-coach] health error:', error);
        return res.status(502).json({ success: false, error: 'Form Coach health check failed' });
    }
});
router.get('/history', authenticate, async (req, res) => {
    try {
        const limitRaw = req.query.limit;
        const limit = typeof limitRaw === 'string' && Number(limitRaw) > 0 ? Number(limitRaw) : 20;
        const analyses = await listFormAnalysesForUser(req.userId, limit);
        return res.json({
            success: true,
            analyses: analyses.map(toClientAnalysis),
        });
    }
    catch (error) {
        console.error('[form-coach] history error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch analysis history' });
    }
});
router.post('/analyze', authenticate, formCoachRateLimiter, (req, res, next) => {
    upload.single('video')(req, res, (err) => {
        if (err) {
            const multerErr = err;
            if (multerErr.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    success: false,
                    error: 'Video exceeds the 50MB size limit.',
                });
            }
            return res.status(400).json({
                success: false,
                error: multerErr.message || 'Invalid video upload',
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        const exercise = normalizeExercise(req.body?.exercise ?? req.query?.exercise);
        const videoUrl = typeof req.body?.videoUrl === 'string' ? req.body.videoUrl.trim() : undefined;
        let videoBuffer;
        let filename;
        let contentType;
        if (req.file) {
            videoBuffer = req.file.buffer;
            filename = req.file.originalname || 'video.mp4';
            contentType = req.file.mimetype;
        }
        else if (videoUrl) {
            const fetched = await fetchVideoFromUrl(videoUrl);
            videoBuffer = fetched.buffer;
            filename = fetched.filename;
            contentType = fetched.contentType;
        }
        else {
            return res.status(400).json({
                success: false,
                error: 'Provide a multipart "video" file or JSON body { videoUrl }.',
            });
        }
        const result = await analyzeFormVideo({
            videoBuffer,
            filename,
            contentType,
            exercise,
        });
        const saved = await saveFormAnalysis({
            userId: req.userId,
            result,
            videoUrl: videoUrl || undefined,
        });
        return res.json({
            success: true,
            ...result,
            analysis: toClientAnalysis(saved),
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
        console.error('[form-coach] analyze error:', error);
        return res.status(502).json({
            success: false,
            error: 'Form Coach analysis failed',
        });
    }
});
export default router;
