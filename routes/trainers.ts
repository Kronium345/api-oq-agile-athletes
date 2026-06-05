import express, { Response } from 'express';
import transporter, { accountEmail, isEmailConfigured } from '../config/nodemailer.ts';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.ts';
import {
  requireTrainer,
  type TrainerRequest,
} from '../middleware/trainer.ts';
import { listAvailableSlots, replaceTrainerSlots } from '../models/bookingSlot.ts';
import {
  createTrainerLead,
  listLeadsForTrainer,
  updateLeadStatus,
} from '../models/trainerLead.ts';
import {
  createTrainerProfile,
  ensureTrainerProfileIndexes,
  getTrainerProfileById,
  getTrainerProfileByUserId,
  getTrainersByIds,
  listPublishedTrainers,
  recomputeTrainerRating,
  updateTrainerProfile,
} from '../models/trainerProfile.ts';
import {
  createTrainerReview,
  ensureTrainerReviewIndexes,
  getReviewByMember,
  getReviewsForTrainer,
} from '../models/trainerReview.ts';
import {
  addSavedTrainer,
  addTrainerRole,
  getUserById,
  removeSavedTrainer,
} from '../models/user.ts';
import {
  createAccountLink,
  getConnectStatus,
  getFrontendUrl,
  getOrCreateConnectAccount,
  getStripe,
} from '../services/stripeConnect.ts';
import { matchTrainers } from '../services/trainerMatch.ts';
import { geocodeUkPostcode, toGeoPoint } from '../utils/geocode.ts';
import { routeParam } from '../utils/routeParams.ts';
import { getDisplayName } from '../utils/userDisplay.ts';
import { toTrainerDetail, toTrainerListItem } from '../utils/trainerResponse.ts';

const router = express.Router();

router.use(async (_req, _res, next) => {
  try {
    await ensureTrainerProfileIndexes();
    await ensureTrainerReviewIndexes();
    next();
  } catch (err) {
    next(err);
  }
});

// --- Static paths before :id ---

router.get('/saved', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getUserById(req.userId!);
    const ids = (user?.savedTrainerIds as string[]) || [];
    const trainers = await getTrainersByIds(ids);
    const ordered = ids
      .map((id) => trainers.find((t) => t.trainerId === id))
      .filter(Boolean)
      .map((t) => toTrainerListItem(t!));
    return res.json({ success: true, trainers: ordered });
  } catch (error: unknown) {
    console.error('GET /trainers/saved error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch saved trainers' });
  }
});

router.get('/leads', authenticate, requireTrainer, async (req: TrainerRequest, res: Response) => {
  try {
    const leads = await listLeadsForTrainer(req.trainerProfile!.trainerId);
    return res.json({ success: true, leads });
  } catch (error: unknown) {
    console.error('GET /trainers/leads error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch leads' });
  }
});

router.put(
  '/leads/:leadId',
  authenticate,
  requireTrainer,
  async (req: TrainerRequest, res: Response) => {
    try {
      const leadId = routeParam(req.params.leadId);
      const { status } = req.body as { status?: string };
      if (status !== 'read' && status !== 'replied') {
        return res.status(400).json({ success: false, error: 'status must be read or replied' });
      }
      const lead = await updateLeadStatus(leadId, req.trainerProfile!.trainerId, status);
      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }
      return res.json({ success: true, lead });
    } catch (error: unknown) {
      console.error('PUT /trainers/leads/:leadId error:', error);
      return res.status(500).json({ success: false, error: 'Failed to update lead' });
    }
  }
);

router.post('/match', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { goal, budget, postcode, trainingStyle, experience } = req.body as {
      goal?: string;
      budget?: string;
      postcode?: string;
      trainingStyle?: string;
      experience?: string;
    };
    if (!goal?.trim()) {
      return res.status(400).json({ success: false, error: 'goal is required' });
    }
    const result = await matchTrainers({
      userId: req.userId!,
      goal: goal.trim(),
      budget,
      postcode,
      trainingStyle,
      experience,
    });
    return res.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('POST /trainers/match error:', error);
    return res.status(500).json({ success: false, error: 'Failed to match trainers' });
  }
});

router.get(
  '/stripe-connect/status',
  authenticate,
  requireTrainer,
  async (req: TrainerRequest, res: Response) => {
    try {
      const status = await getConnectStatus(req.userId!);
      return res.json({ success: true, ...status });
    } catch (error: unknown) {
      console.error('GET stripe-connect/status error:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch Stripe status' });
    }
  }
);

router.post(
  '/stripe-connect/onboard',
  authenticate,
  requireTrainer,
  async (req: TrainerRequest, res: Response) => {
    try {
      if (!getStripe()) {
        return res.status(503).json({ success: false, error: 'Stripe is not configured' });
      }
      const accountId = await getOrCreateConnectAccount(req.trainerProfile!);
      const url = await createAccountLink(accountId);
      return res.json({ success: true, url });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('POST stripe-connect/onboard error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Onboarding failed' });
    }
  }
);

router.get('/stripe-connect/callback', (_req, res: Response) => {
  const frontend = getFrontendUrl();
  res.redirect(`${frontend}/trainer/stripe/return`);
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await getTrainerProfileByUserId(req.userId!);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Trainer profile not found' });
    }
    return res.json({ success: true, trainer: toTrainerDetail(profile) });
  } catch (error: unknown) {
    console.error('GET /trainers/me error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

router.post('/profile', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = await getTrainerProfileByUserId(req.userId!);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Trainer profile already exists',
        trainer: toTrainerDetail(existing),
      });
    }

    const body = req.body as Record<string, unknown>;
    const displayName = String(body.displayName || '').trim();
    const bio = String(body.bio || '').trim();
    const gymName = String(body.gymName || '').trim();
    const postcode = String(body.postcode || '').trim();

    if (!displayName || !gymName || !postcode) {
      return res.status(400).json({
        success: false,
        error: 'displayName, gymName, and postcode are required',
      });
    }

    let location = undefined;
    const geo = await geocodeUkPostcode(postcode);
    if (geo) {
      location = toGeoPoint(geo.lat, geo.lng);
    }

    const profile = await createTrainerProfile({
      userId: req.userId!,
      displayName,
      bio,
      qualifications: Array.isArray(body.qualifications) ? body.qualifications : [],
      specialties: Array.isArray(body.specialties) ? body.specialties : [],
      gymName,
      postcode: geo?.postcode || postcode,
      location,
      priceFrom: typeof body.priceFrom === 'number' ? body.priceFrom : undefined,
      priceUnit: (body.priceUnit as 'session' | 'hour' | 'month') || 'session',
      instagram: typeof body.instagram === 'string' ? body.instagram : undefined,
      availabilityNotes:
        typeof body.availabilityNotes === 'string' ? body.availabilityNotes : undefined,
      published: Boolean(body.published),
    });

    await addTrainerRole(req.userId!);

    return res.status(201).json({
      success: true,
      message: 'Trainer profile created',
      trainer: toTrainerDetail(profile),
    });
  } catch (error: unknown) {
    console.error('POST /trainers/profile error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create profile' });
  }
});

router.put('/profile', authenticate, requireTrainer, async (req: TrainerRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    const stringFields = [
      'displayName',
      'bio',
      'gymName',
      'postcode',
      'instagram',
      'availabilityNotes',
    ] as const;
    for (const field of stringFields) {
      if (typeof body[field] === 'string') updates[field] = body[field];
    }
    if (Array.isArray(body.qualifications)) updates.qualifications = body.qualifications;
    if (Array.isArray(body.specialties)) updates.specialties = body.specialties;
    if (typeof body.priceFrom === 'number') updates.priceFrom = body.priceFrom;
    if (body.priceUnit === 'session' || body.priceUnit === 'hour' || body.priceUnit === 'month') {
      updates.priceUnit = body.priceUnit;
    }
    if (typeof body.published === 'boolean') updates.published = body.published;

    if (typeof body.postcode === 'string' && body.postcode.trim()) {
      const geo = await geocodeUkPostcode(body.postcode);
      if (geo) {
        updates.postcode = geo.postcode;
        updates.location = toGeoPoint(geo.lat, geo.lng);
      }
    }

    const profile = await updateTrainerProfile(req.userId!, updates);
    return res.json({
      success: true,
      message: 'Profile updated',
      trainer: profile ? toTrainerDetail(profile) : null,
    });
  } catch (error: unknown) {
    console.error('PUT /trainers/profile error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

router.put(
  '/availability',
  authenticate,
  requireTrainer,
  async (req: TrainerRequest, res: Response) => {
    try {
      const { slots } = req.body as {
        slots?: Array<{ startsAt: string; endsAt: string; available?: boolean }>;
      };
      if (!Array.isArray(slots)) {
        return res.status(400).json({ success: false, error: 'slots array is required' });
      }
      const saved = await replaceTrainerSlots(req.trainerProfile!.trainerId, slots);
      return res.json({ success: true, slots: saved });
    } catch (error: unknown) {
      console.error('PUT /trainers/availability error:', error);
      return res.status(500).json({ success: false, error: 'Failed to update availability' });
    }
  }
);

router.get('/', async (req, res: Response) => {
  try {
    const specialty = typeof req.query.specialty === 'string' ? req.query.specialty : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const gymName = typeof req.query.gymName === 'string' ? req.query.gymName : undefined;
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

    const results = await listPublishedTrainers({
      specialty,
      q,
      gymName,
      nearLat,
      nearLng,
      radiusKm,
      limit,
    });

    const trainers = results.map((t) =>
      toTrainerListItem(t, { distanceKm: t.distanceKm })
    );
    return res.json({ success: true, trainers });
  } catch (error: unknown) {
    console.error('GET /trainers error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list trainers' });
  }
});

router.post('/:id/save', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const trainerId = routeParam(req.params.id);
    const trainer = await getTrainerProfileById(trainerId);
    if (!trainer?.published) {
      return res.status(404).json({ success: false, error: 'Trainer not found' });
    }
    await addSavedTrainer(req.userId!, trainerId);
    return res.json({ success: true, message: 'Trainer saved' });
  } catch (error: unknown) {
    console.error('POST /trainers/:id/save error:', error);
    return res.status(500).json({ success: false, error: 'Failed to save trainer' });
  }
});

router.delete('/:id/save', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const trainerId = routeParam(req.params.id);
    await removeSavedTrainer(req.userId!, trainerId);
    return res.json({ success: true, message: 'Trainer removed from saved' });
  } catch (error: unknown) {
    console.error('DELETE /trainers/:id/save error:', error);
    return res.status(500).json({ success: false, error: 'Failed to unsave trainer' });
  }
});

router.post(
  '/:id/contact-request',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const trainerId = routeParam(req.params.id);
      const trainer = await getTrainerProfileById(trainerId);
      if (!trainer?.published) {
        return res.status(404).json({ success: false, error: 'Trainer not found' });
      }

      const { message, goal, budget } = req.body as {
        message?: string;
        goal?: string;
        budget?: string;
      };
      if (!message?.trim()) {
        return res.status(400).json({ success: false, error: 'message is required' });
      }

      const member = req.user!;
      const memberName = getDisplayName(member);

      const lead = await createTrainerLead({
        trainerId,
        memberId: req.userId!,
        memberName,
        message: message.trim(),
        goal,
        budget,
      });

      if (isEmailConfigured()) {
        const trainerUser = await getUserById(trainer.userId);
        if (trainerUser?.email) {
          transporter
            .sendMail({
              from: accountEmail,
              to: trainerUser.email,
              subject: `New training enquiry from ${memberName}`,
              text: `${memberName} sent a message:\n\n${message.trim()}\n\nGoal: ${goal || '—'}\nBudget: ${budget || '—'}`,
            })
            .catch((err) => console.warn('[trainers] lead email failed:', err.message));
        }
      }

      return res.status(201).json({ success: true, lead });
    } catch (error: unknown) {
      console.error('POST contact-request error:', error);
      return res.status(500).json({ success: false, error: 'Failed to send contact request' });
    }
  }
);

router.get('/:id/reviews', async (req, res: Response) => {
  try {
    const trainerId = routeParam(req.params.id);
    const reviews = await getReviewsForTrainer(trainerId);
    return res.json({ success: true, reviews });
  } catch (error: unknown) {
    console.error('GET reviews error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch reviews' });
  }
});

router.post('/:id/reviews', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const trainerId = routeParam(req.params.id);
    const trainer = await getTrainerProfileById(trainerId);
    if (!trainer?.published) {
      return res.status(404).json({ success: false, error: 'Trainer not found' });
    }

    const { rating, text } = req.body as { rating?: number; text?: string };
    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return res.status(400).json({ success: false, error: 'rating must be an integer 1-5' });
    }
    if (!text?.trim()) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    const existing = await getReviewByMember(trainerId, req.userId!);
    if (existing) {
      return res.status(409).json({ success: false, error: 'You have already reviewed this trainer' });
    }

    const review = await createTrainerReview({
      trainerId,
      memberId: req.userId!,
      displayName: getDisplayName(req.user!),
      rating,
      text: text.trim(),
    });

    await recomputeTrainerRating(trainerId);

    return res.status(201).json({ success: true, review });
  } catch (error: unknown) {
    console.error('POST review error:', error);
    return res.status(500).json({ success: false, error: 'Failed to submit review' });
  }
});

router.get('/:id/availability', async (req, res: Response) => {
  try {
    const trainerId = routeParam(req.params.id);
    const trainer = await getTrainerProfileById(trainerId);
    if (!trainer?.published) {
      return res.status(404).json({ success: false, error: 'Trainer not found' });
    }
    const slots = await listAvailableSlots(trainerId);
    return res.json({ success: true, slots });
  } catch (error: unknown) {
    console.error('GET availability error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch availability' });
  }
});

router.get('/:id', async (req, res: Response) => {
  try {
    const trainerId = routeParam(req.params.id);
    const profile = await getTrainerProfileById(trainerId);
    if (!profile?.published) {
      return res.status(404).json({ success: false, error: 'Trainer not found' });
    }
    return res.json({ success: true, trainer: toTrainerDetail(profile) });
  } catch (error: unknown) {
    console.error('GET /trainers/:id error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch trainer' });
  }
});

export default router;
