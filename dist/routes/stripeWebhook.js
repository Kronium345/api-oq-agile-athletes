import express from 'express';
import { getBookingById, updateBooking } from "../models/booking.js";
import { markSlotAvailable } from "../models/bookingSlot.js";
import { getStripe, syncConnectAccountFromWebhook } from "../services/stripeConnect.js";
const router = express.Router();
router.post('/', async (req, res) => {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!stripe || !webhookSecret) {
        return res.status(503).json({ success: false, error: 'Stripe webhooks not configured' });
    }
    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing stripe-signature' });
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
    catch (err) {
        const message = err.message;
        console.error('[stripe webhook] signature verification failed:', message);
        return res.status(400).json({ success: false, error: `Webhook Error: ${message}` });
    }
    try {
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const intent = event.data.object;
                const bookingId = intent.metadata?.bookingId;
                if (bookingId) {
                    await updateBooking(bookingId, { status: 'confirmed' });
                }
                break;
            }
            case 'payment_intent.payment_failed': {
                const intent = event.data.object;
                const bookingId = intent.metadata?.bookingId;
                if (bookingId) {
                    const booking = await getBookingById(bookingId);
                    if (booking) {
                        await updateBooking(bookingId, { status: 'cancelled' });
                        await markSlotAvailable(booking.slotId);
                    }
                }
                break;
            }
            case 'account.updated': {
                const account = event.data.object;
                await syncConnectAccountFromWebhook(account);
                break;
            }
            default:
                break;
        }
        return res.json({ received: true });
    }
    catch (error) {
        console.error('[stripe webhook] handler error:', error);
        return res.status(500).json({ success: false, error: 'Webhook handler failed' });
    }
});
export default router;
