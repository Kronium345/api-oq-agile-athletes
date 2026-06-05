import express, { Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.ts';
import {
  createBooking,
  getBookingById,
  listBookingsForUser,
  updateBooking,
} from '../models/booking.ts';
import { getSlotById, markSlotAvailable, markSlotUnavailable } from '../models/bookingSlot.ts';
import { getTrainerProfileById, getTrainerProfileByUserId } from '../models/trainerProfile.ts';
import {
  createBookingPaymentIntent,
  getPlatformCommissionPercent,
  getStripe,
} from '../services/stripeConnect.ts';
import { routeParam } from '../utils/routeParams.ts';

const router = express.Router();

router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { trainerId, slotId } = req.body as { trainerId?: string; slotId?: string };
    if (!trainerId || !slotId) {
      return res.status(400).json({ success: false, error: 'trainerId and slotId are required' });
    }

    const trainer = await getTrainerProfileById(trainerId);
    if (!trainer?.published) {
      return res.status(404).json({ success: false, error: 'Trainer not found' });
    }
    if (!trainer.stripeConnectOnboarded || !trainer.chargesEnabled || !trainer.stripeConnectAccountId) {
      return res.status(400).json({
        success: false,
        error: 'Trainer is not set up to accept payments yet',
      });
    }

    const slot = await getSlotById(slotId);
    if (!slot || slot.trainerId !== trainerId || !slot.available) {
      return res.status(400).json({ success: false, error: 'Slot is not available' });
    }

    const amountPence = Math.round((trainer.priceFrom || 50) * 100);
    const platformFeePence = Math.round((amountPence * getPlatformCommissionPercent()) / 100);
    const trainerPayoutPence = amountPence - platformFeePence;

    const booking = await createBooking({
      trainerId,
      memberId: req.userId!,
      slotId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      amountPence,
      platformFeePence,
      trainerPayoutPence,
    });

    if (!getStripe()) {
      return res.status(503).json({ success: false, error: 'Stripe is not configured' });
    }

    const payment = await createBookingPaymentIntent({
      amountPence,
      trainerConnectAccountId: trainer.stripeConnectAccountId,
      bookingId: booking.bookingId,
      trainerId,
      memberId: req.userId!,
    });

    await updateBooking(booking.bookingId, {
      stripePaymentIntentId: payment.paymentIntentId,
      platformFeePence: payment.platformFeePence,
      trainerPayoutPence: amountPence - payment.platformFeePence,
    });

    await markSlotUnavailable(slotId);

    const updated = await getBookingById(booking.bookingId);
    return res.status(201).json({
      success: true,
      booking: updated,
      clientSecret: payment.clientSecret,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('POST /bookings error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to create booking' });
  }
});

router.post('/:id/confirm', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = routeParam(req.params.id);
    const booking = await getBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    if (booking.memberId !== req.userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const stripe = getStripe();
    if (stripe && booking.stripePaymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
      if (intent.status === 'succeeded') {
        const updated = await updateBooking(bookingId, { status: 'confirmed' });
        return res.json({ success: true, booking: updated });
      }
    }

    return res.status(400).json({
      success: false,
      error: 'Payment not yet confirmed',
      booking,
    });
  } catch (error: unknown) {
    console.error('POST /bookings/:id/confirm error:', error);
    return res.status(500).json({ success: false, error: 'Failed to confirm booking' });
  }
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const trainerProfile = await getTrainerProfileByUserId(req.userId!);
    const bookings = await listBookingsForUser(
      req.userId!,
      trainerProfile?.trainerId ?? null
    );
    return res.json({ success: true, bookings });
  } catch (error: unknown) {
    console.error('GET /bookings/me error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
  }
});

router.post('/:id/cancel', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bookingId = routeParam(req.params.id);
    const booking = await getBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const trainerProfile = await getTrainerProfileByUserId(req.userId!);
    const isMember = booking.memberId === req.userId;
    const isTrainer = trainerProfile?.trainerId === booking.trainerId;
    if (!isMember && !isTrainer) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    if (booking.status === 'cancelled') {
      return res.json({ success: true, booking });
    }

    const stripe = getStripe();
    if (
      stripe &&
      booking.stripePaymentIntentId &&
      (booking.status === 'confirmed' || booking.status === 'pending_payment')
    ) {
      try {
        await stripe.refunds.create({
          payment_intent: booking.stripePaymentIntentId,
        });
      } catch (refundErr) {
        console.warn('[bookings] refund failed:', (refundErr as Error).message);
      }
    }

    await markSlotAvailable(booking.slotId);
    const updated = await updateBooking(bookingId, { status: 'cancelled' });
    return res.json({ success: true, booking: updated });
  } catch (error: unknown) {
    console.error('POST /bookings/:id/cancel error:', error);
    return res.status(500).json({ success: false, error: 'Failed to cancel booking' });
  }
});

export default router;
