import express from 'express';
import { authenticate } from "../middleware/auth.js";
import { ensureFitnessGroupIndexes, getFitnessGroupById, listFitnessGroups, } from "../models/fitnessGroup.js";
import { getUserById } from "../models/user.js";
import { listTrainingPartners } from "../services/communityPartners.js";
import { acceptConnection, declineConnection, listPendingConnections, sendPartnerConnect, } from "../services/partnerConnections.js";
import { geocodeUkPostcode } from "../utils/geocode.js";
import { parseQueryNumber, toClientGroup } from "../utils/communityResponse.js";
import { routeParam } from "../utils/routeParams.js";
const router = express.Router();
const DEFAULT_RADIUS_KM = 10;
router.use(async (_req, _res, next) => {
    try {
        await ensureFitnessGroupIndexes();
        next();
    }
    catch (err) {
        next(err);
    }
});
router.get('/partners', authenticate, async (req, res) => {
    try {
        const caller = await getUserById(req.userId);
        if (!caller) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        const gymNameQuery = typeof req.query.gymName === 'string' ? req.query.gymName.trim() : undefined;
        const goalQuery = typeof req.query.goal === 'string' ? req.query.goal.trim() : undefined;
        const effectiveGym = gymNameQuery || (typeof caller.gymName === 'string' ? caller.gymName : undefined);
        const callerGoal = (typeof caller.goal === 'string' ? caller.goal : undefined) ||
            (typeof caller.fitnessGoal === 'string' ? caller.fitnessGoal : undefined);
        const partners = await listTrainingPartners({
            userId: req.userId,
            gymName: effectiveGym,
            goal: goalQuery,
            preferredGoal: callerGoal,
            experience: typeof caller.experience === 'string' ? caller.experience : undefined,
            gender: typeof caller.gender === 'string' ? caller.gender : undefined,
        });
        return res.json({ success: true, partners });
    }
    catch (error) {
        console.error('GET /community/partners error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch partners' });
    }
});
router.post('/partners/:userId/connect', authenticate, async (req, res) => {
    try {
        const toUserId = routeParam(req.params.userId);
        const result = await sendPartnerConnect(req.userId, toUserId);
        if (result.ok === false) {
            return res.status(result.httpStatus).json({ success: false, message: result.message });
        }
        return res.json({
            success: true,
            message: result.message,
            status: result.connectionStatus,
            requestId: result.requestId,
        });
    }
    catch (error) {
        console.error('POST /community/partners/:userId/connect error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send partner request' });
    }
});
router.get('/connections/pending', authenticate, async (req, res) => {
    try {
        const { incoming, outgoing } = await listPendingConnections(req.userId);
        return res.json({ success: true, incoming, outgoing });
    }
    catch (error) {
        console.error('GET /community/connections/pending error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch connection requests' });
    }
});
router.post('/connections/:requestId/accept', authenticate, async (req, res) => {
    try {
        const requestId = routeParam(req.params.requestId);
        const result = await acceptConnection(requestId, req.userId);
        if (result.ok === false) {
            return res.status(result.httpStatus).json({ success: false, message: result.message });
        }
        return res.json({ success: true, message: result.message, status: 'accepted' });
    }
    catch (error) {
        console.error('POST /community/connections/:requestId/accept error:', error);
        return res.status(500).json({ success: false, message: 'Failed to accept connection request' });
    }
});
router.post('/connections/:requestId/decline', authenticate, async (req, res) => {
    try {
        const requestId = routeParam(req.params.requestId);
        const result = await declineConnection(requestId, req.userId);
        if (result.ok === false) {
            return res.status(result.httpStatus).json({ success: false, message: result.message });
        }
        return res.json({ success: true, message: result.message, status: 'declined' });
    }
    catch (error) {
        console.error('POST /community/connections/:requestId/decline error:', error);
        return res.status(500).json({ success: false, message: 'Failed to decline connection request' });
    }
});
router.get('/groups', async (req, res) => {
    try {
        const postcode = typeof req.query.postcode === 'string' ? req.query.postcode.trim() : undefined;
        const radiusKm = parseQueryNumber(req.query.radiusKm) ?? DEFAULT_RADIUS_KM;
        const limit = parseQueryNumber(req.query.limit) ?? 20;
        let nearLat = parseQueryNumber(req.query.latitude) ?? parseQueryNumber(req.query.lat);
        let nearLng = parseQueryNumber(req.query.longitude) ?? parseQueryNumber(req.query.lng);
        if (postcode && nearLat == null && nearLng == null) {
            const geo = await geocodeUkPostcode(postcode);
            if (geo) {
                nearLat = geo.lat;
                nearLng = geo.lng;
            }
        }
        const groups = await listFitnessGroups({
            nearLat,
            nearLng,
            radiusKm: nearLat != null && nearLng != null ? radiusKm : undefined,
            limit,
        });
        return res.json({
            success: true,
            groups: groups.map(toClientGroup),
        });
    }
    catch (error) {
        console.error('GET /community/groups error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch groups' });
    }
});
router.get('/groups/:id', async (req, res) => {
    try {
        const groupId = routeParam(req.params.id);
        const group = await getFitnessGroupById(groupId);
        if (!group) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }
        return res.json({ success: true, group: toClientGroup(group) });
    }
    catch (error) {
        console.error('GET /community/groups/:id error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch group' });
    }
});
export default router;
