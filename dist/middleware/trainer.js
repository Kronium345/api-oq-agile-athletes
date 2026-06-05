import { getTrainerProfileByUserId } from "../models/trainerProfile.js";
async function requireTrainer(req, res, next) {
    if (!req.userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
    }
    const profile = await getTrainerProfileByUserId(req.userId);
    if (!profile) {
        res.status(404).json({ success: false, error: 'Trainer profile not found' });
        return;
    }
    req.trainerProfile = profile;
    next();
}
async function requirePublishedTrainer(req, res, next) {
    if (!req.userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
    }
    const profile = await getTrainerProfileByUserId(req.userId);
    if (!profile) {
        res.status(404).json({ success: false, error: 'Trainer profile not found' });
        return;
    }
    if (!profile.published) {
        res.status(403).json({ success: false, error: 'Trainer profile must be published' });
        return;
    }
    req.trainerProfile = profile;
    next();
}
async function requireTrainerStripe(req, res, next) {
    const profile = req.trainerProfile;
    if (!profile) {
        res.status(500).json({ success: false, error: 'Trainer context missing' });
        return;
    }
    const { stripeConnectOnboarded, chargesEnabled, stripeConnectAccountId } = profile;
    if (!stripeConnectOnboarded || !chargesEnabled || !stripeConnectAccountId) {
        res.status(403).json({
            success: false,
            error: 'Stripe Connect onboarding required before accepting bookings',
        });
        return;
    }
    next();
}
export { requireTrainer, requirePublishedTrainer, requireTrainerStripe };
