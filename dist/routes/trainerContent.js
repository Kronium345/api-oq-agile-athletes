import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from "../middleware/auth.js";
import { requireTrainer } from "../middleware/trainer.js";
import { createTrainerVideo, deleteTrainerVideo, ensureTrainerVideoIndexes, getTrainerVideoById, getTrainerVideoForTrainer, listAssignedVideosForMember, listAssignedVideosForMemberFromTrainer, listTrainerVideosForTrainer, updateTrainerVideo, } from "../models/trainerVideo.js";
import { getTrainerProfileById } from "../models/trainerProfile.js";
import { buildTrainerVideoStorageKey, deleteTrainerVideoObject, getPublicApiBaseUrl, isTrainerVideoStorageReady, openLocalTrainerVideoStream, TRAINER_VIDEO_MAX_BYTES, uploadTrainerVideoObject, verifyTrainerVideoPlayToken, } from "../services/trainerVideoStorage.js";
import { routeParam } from "../utils/routeParams.js";
import { toTrainerVideoClient, toTrainerVideoClients } from "../utils/trainerVideoResponse.js";
import { canMemberPlayVideo, parseAssignedMemberIds, validateTrainerVideoDescription, validateTrainerVideoTitle, } from "../utils/trainerVideoValidation.js";
const router = express.Router();
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov']);
const ALLOWED_MIMES = /^(video\/(mp4|quicktime)|application\/octet-stream)$/i;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: TRAINER_VIDEO_MAX_BYTES },
    fileFilter(_req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const mimeOk = ALLOWED_MIMES.test(file.mimetype);
        const extOk = ALLOWED_EXTENSIONS.has(ext);
        if (mimeOk || extOk) {
            cb(null, true);
            return;
        }
        cb(new Error('Invalid video type. Allowed: .mp4, .mov'));
    },
});
router.use(async (_req, _res, next) => {
    try {
        await ensureTrainerVideoIndexes();
        next();
    }
    catch (err) {
        next(err);
    }
});
function resolveApiBase(req) {
    const protoHeader = req.headers['x-forwarded-proto'];
    const hostHeader = req.headers['x-forwarded-host'] || req.get('host');
    const proto = typeof protoHeader === 'string' ? protoHeader.split(',')[0] : req.protocol;
    const host = typeof hostHeader === 'string' ? hostHeader.split(',')[0] : hostHeader;
    const fromRequest = host ? `${proto}://${host}` : undefined;
    return getPublicApiBaseUrl(fromRequest);
}
router.get('/me/content', authenticate, requireTrainer, async (req, res) => {
    try {
        const trainerId = req.trainerProfile.trainerId;
        const videos = await listTrainerVideosForTrainer(trainerId);
        const apiBase = resolveApiBase(req);
        const payload = await toTrainerVideoClients(videos, req.userId, apiBase);
        return res.json({ success: true, videos: payload });
    }
    catch (error) {
        console.error('GET /trainers/me/content error:', error);
        return res.status(500).json({ success: false, error: 'Failed to list trainer videos' });
    }
});
router.post('/me/content', authenticate, requireTrainer, (req, res, next) => {
    upload.single('video')(req, res, (err) => {
        if (err) {
            const multerErr = err;
            if (multerErr.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    success: false,
                    error: `Video exceeds max size (${TRAINER_VIDEO_MAX_BYTES} bytes)`,
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
        if (!isTrainerVideoStorageReady()) {
            return res.status(503).json({
                success: false,
                error: 'Trainer video storage is not configured. Set TRAINER_VIDEO_STORAGE=r2 and R2_* env vars.',
            });
        }
        const file = req.file;
        if (!file?.buffer?.length) {
            return res.status(400).json({ success: false, error: 'video file is required' });
        }
        const titleResult = validateTrainerVideoTitle(req.body?.title);
        if (titleResult.ok === false) {
            return res.status(400).json({ success: false, error: titleResult.error });
        }
        const descriptionResult = validateTrainerVideoDescription(req.body?.description);
        if (descriptionResult.ok === false) {
            return res.status(400).json({ success: false, error: descriptionResult.error });
        }
        const assigneesResult = parseAssignedMemberIds(req.body?.assignedMemberIds);
        if (assigneesResult.ok === false) {
            return res.status(400).json({ success: false, error: assigneesResult.error });
        }
        const trainerId = req.trainerProfile.trainerId;
        const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
        const videoId = uuidv4();
        const storageKey = buildTrainerVideoStorageKey(trainerId, videoId, ext);
        await uploadTrainerVideoObject(storageKey, file.buffer, file.mimetype || 'video/mp4');
        const video = await createTrainerVideo({
            videoId,
            trainerId,
            userId: req.userId,
            title: titleResult.title,
            description: descriptionResult.description,
            storageKey,
            mimeType: file.mimetype || 'video/mp4',
            assignedMemberIds: assigneesResult.ids,
        });
        const apiBase = resolveApiBase(req);
        const payload = await toTrainerVideoClient(video, req.userId, apiBase);
        return res.status(201).json({ success: true, video: payload });
    }
    catch (error) {
        console.error('POST /trainers/me/content error:', error);
        return res.status(500).json({ success: false, error: 'Failed to upload trainer video' });
    }
});
router.put('/me/content/:videoId', authenticate, requireTrainer, async (req, res) => {
    try {
        const videoId = routeParam(req.params.videoId);
        const trainerId = req.trainerProfile.trainerId;
        const existing = await getTrainerVideoForTrainer(trainerId, videoId);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }
        const body = req.body;
        const patch = {};
        if (body.title !== undefined) {
            const titleResult = validateTrainerVideoTitle(body.title);
            if (titleResult.ok === false) {
                return res.status(400).json({ success: false, error: titleResult.error });
            }
            patch.title = titleResult.title;
        }
        if (body.description !== undefined) {
            const descriptionResult = validateTrainerVideoDescription(body.description);
            if (descriptionResult.ok === false) {
                return res.status(400).json({ success: false, error: descriptionResult.error });
            }
            patch.description = descriptionResult.description;
        }
        if (body.assignedMemberIds !== undefined) {
            const assigneesResult = parseAssignedMemberIds(body.assignedMemberIds);
            if (assigneesResult.ok === false) {
                return res.status(400).json({ success: false, error: assigneesResult.error });
            }
            patch.assignedMemberIds = assigneesResult.ids;
        }
        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }
        const video = await updateTrainerVideo(trainerId, videoId, patch);
        const apiBase = resolveApiBase(req);
        const payload = await toTrainerVideoClient(video, req.userId, apiBase);
        return res.json({ success: true, video: payload });
    }
    catch (error) {
        console.error('PUT /trainers/me/content/:videoId error:', error);
        return res.status(500).json({ success: false, error: 'Failed to update trainer video' });
    }
});
router.delete('/me/content/:videoId', authenticate, requireTrainer, async (req, res) => {
    try {
        const videoId = routeParam(req.params.videoId);
        const trainerId = req.trainerProfile.trainerId;
        const deleted = await deleteTrainerVideo(trainerId, videoId);
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }
        await deleteTrainerVideoObject(deleted.storageKey, deleted.thumbnailKey);
        return res.json({ success: true, message: 'Video deleted' });
    }
    catch (error) {
        console.error('DELETE /trainers/me/content/:videoId error:', error);
        return res.status(500).json({ success: false, error: 'Failed to delete trainer video' });
    }
});
router.get('/content/assigned', authenticate, async (req, res) => {
    try {
        const videos = await listAssignedVideosForMember(req.userId);
        const apiBase = resolveApiBase(req);
        const payload = await toTrainerVideoClients(videos, req.userId, apiBase);
        return res.json({ success: true, videos: payload });
    }
    catch (error) {
        console.error('GET /trainers/content/assigned error:', error);
        return res.status(500).json({ success: false, error: 'Failed to list assigned videos' });
    }
});
router.get('/content/play/:videoId', async (req, res) => {
    try {
        const videoId = routeParam(req.params.videoId);
        const token = typeof req.query.token === 'string' ? req.query.token : '';
        const claims = verifyTrainerVideoPlayToken(token);
        if (!claims || claims.videoId !== videoId) {
            return res.status(401).json({ success: false, error: 'Invalid or expired play token' });
        }
        const video = await getTrainerVideoById(videoId);
        if (!video) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }
        const isTrainerOwner = video.userId === claims.userId;
        const isAssigned = canMemberPlayVideo(video, claims.userId);
        if (!isTrainerOwner && !isAssigned) {
            return res.status(403).json({ success: false, error: 'Not authorized to play this video' });
        }
        const { stream, contentType, contentLength } = await openLocalTrainerVideoStream(video.storageKey);
        res.setHeader('Content-Type', contentType);
        if (contentLength) {
            res.setHeader('Content-Length', String(contentLength));
        }
        res.setHeader('Cache-Control', 'private, max-age=60');
        stream.pipe(res);
    }
    catch (error) {
        console.error('GET /trainers/content/play/:videoId error:', error);
        return res.status(500).json({ success: false, error: 'Failed to stream video' });
    }
});
router.get('/:trainerId/content', authenticate, async (req, res) => {
    try {
        const trainerId = routeParam(req.params.trainerId);
        const trainer = await getTrainerProfileById(trainerId);
        if (!trainer?.published) {
            return res.status(404).json({ success: false, error: 'Trainer not found' });
        }
        const videos = await listAssignedVideosForMemberFromTrainer(trainerId, req.userId);
        const apiBase = resolveApiBase(req);
        const payload = await toTrainerVideoClients(videos, req.userId, apiBase);
        return res.json({ success: true, videos: payload });
    }
    catch (error) {
        console.error('GET /trainers/:trainerId/content error:', error);
        return res.status(500).json({ success: false, error: 'Failed to list trainer videos' });
    }
});
export default router;
