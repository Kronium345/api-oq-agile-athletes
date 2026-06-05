import express, { Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.ts';
import { addFriendship } from '../services/stepsSocial.ts';
import {
  ensureFitnessGroupIndexes,
  getFitnessGroupById,
  listFitnessGroups,
} from '../models/fitnessGroup.ts';
import {
  acceptPartnerRequest,
  createPartnerRequest,
  getPartnerRequestBetween,
} from '../models/partnerConnectRequest.ts';
import { getUserById } from '../models/user.ts';
import { geocodeUkPostcode } from '../utils/geocode.ts';
import { routeParam } from '../utils/routeParams.ts';
import { toPublicUserCard } from '../utils/userDisplay.ts';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';

const router = express.Router();

router.use(async (_req, _res, next) => {
  try {
    await ensureFitnessGroupIndexes();
    next();
  } catch (err) {
    next(err);
  }
});

router.get('/partners', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gymName = typeof req.query.gymName === 'string' ? req.query.gymName.trim() : undefined;
    const goal = typeof req.query.goal === 'string' ? req.query.goal.trim().toLowerCase() : undefined;
    const user = await getUserById(req.userId!);
    const effectiveGym =
      gymName || (typeof user?.gymName === 'string' ? user.gymName : undefined);

    const col = getMongoClient().db(getMongoDbName()).collection('users');
    const filter: Record<string, unknown> = {
      userId: { $ne: req.userId },
    };
    if (effectiveGym) {
      filter.gymName = { $regex: effectiveGym, $options: 'i' };
    }
    if (goal) {
      filter.$or = [
        { experience: { $regex: goal, $options: 'i' } },
        { name: { $regex: goal, $options: 'i' } },
      ];
    }

    const users = await col
      .find(filter)
      .project({ password: 0, email: 0 })
      .limit(30)
      .toArray();

    const partners = users.map((u) => ({
      ...toPublicUserCard(u as { userId: string; name?: string }),
      gymName: (u as { gymName?: string }).gymName,
      experience: (u as { experience?: string }).experience,
    }));

    return res.json({ success: true, partners });
  } catch (error: unknown) {
    console.error('GET /community/partners error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch partners' });
  }
});

router.post(
  '/partners/:userId/connect',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const toUserId = routeParam(req.params.userId);
      if (toUserId === req.userId) {
        return res.status(400).json({ success: false, error: 'Cannot connect with yourself' });
      }

      const target = await getUserById(toUserId);
      if (!target) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const request = await createPartnerRequest(req.userId!, toUserId);

      if (request.status === 'pending') {
        const reverse = await getPartnerRequestBetween(toUserId, req.userId!);
        if (reverse?.fromUserId === toUserId && reverse.status === 'pending') {
          await acceptPartnerRequest(toUserId, req.userId!);
          await addFriendship(req.userId!, toUserId);
          return res.json({
            success: true,
            message: 'Partner connection accepted',
            status: 'accepted',
          });
        }
      }

      return res.json({
        success: true,
        message: 'Partner request sent',
        status: request.status,
        request,
      });
    } catch (error: unknown) {
      console.error('POST /community/partners/:userId/connect error:', error);
      return res.status(500).json({ success: false, error: 'Failed to send partner request' });
    }
  }
);

router.get('/groups', async (req, res: Response) => {
  try {
    const postcode = typeof req.query.postcode === 'string' ? req.query.postcode : undefined;
    const radiusKm =
      typeof req.query.radiusKm === 'string' ? Number(req.query.radiusKm) : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;

    let nearLat: number | undefined;
    let nearLng: number | undefined;
    if (postcode && radiusKm && radiusKm > 0) {
      const geo = await geocodeUkPostcode(postcode);
      if (geo) {
        nearLat = geo.lat;
        nearLng = geo.lng;
      }
    }

    const groups = await listFitnessGroups({ nearLat, nearLng, radiusKm, limit });
    return res.json({ success: true, groups });
  } catch (error: unknown) {
    console.error('GET /community/groups error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch groups' });
  }
});

router.get('/groups/:id', async (req, res: Response) => {
  try {
    const groupId = routeParam(req.params.id);
    const group = await getFitnessGroupById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    return res.json({ success: true, group });
  } catch (error: unknown) {
    console.error('GET /community/groups/:id error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch group' });
  }
});

export default router;
