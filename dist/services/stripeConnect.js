import Stripe from 'stripe';
import { getTrainerProfileByUserId, updateTrainerProfile, } from "../models/trainerProfile.js";
let stripeClient = null;
export function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key)
        return null;
    if (!stripeClient) {
        stripeClient = new Stripe(key);
    }
    return stripeClient;
}
export function getPlatformCommissionPercent() {
    return Number(process.env.PLATFORM_COMMISSION_PERCENT || 10);
}
export function getFrontendUrl() {
    return (process.env.FRONTEND_URL || 'http://localhost:8081').replace(/\/$/, '');
}
export async function getOrCreateConnectAccount(profile) {
    const stripe = getStripe();
    if (!stripe)
        throw new Error('Stripe is not configured');
    if (profile.stripeConnectAccountId) {
        return profile.stripeConnectAccountId;
    }
    const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
        },
        metadata: { trainerId: profile.trainerId, userId: profile.userId },
    });
    await updateTrainerProfile(profile.userId, {
        stripeConnectAccountId: account.id,
    });
    return account.id;
}
export async function createAccountLink(accountId) {
    const stripe = getStripe();
    if (!stripe)
        throw new Error('Stripe is not configured');
    const frontend = getFrontendUrl();
    const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${frontend}/trainer/stripe/refresh`,
        return_url: `${frontend}/trainer/stripe/return`,
        type: 'account_onboarding',
    });
    return link.url;
}
export async function getConnectStatus(userId) {
    const profile = await getTrainerProfileByUserId(userId);
    if (!profile?.stripeConnectAccountId) {
        return { onboarded: false, chargesEnabled: false, payoutsEnabled: false };
    }
    const stripe = getStripe();
    if (!stripe) {
        return {
            onboarded: profile.stripeConnectOnboarded,
            chargesEnabled: Boolean(profile.chargesEnabled),
            payoutsEnabled: Boolean(profile.payoutsEnabled),
        };
    }
    const account = await stripe.accounts.retrieve(profile.stripeConnectAccountId);
    const chargesEnabled = Boolean(account.charges_enabled);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const onboarded = chargesEnabled && payoutsEnabled;
    if (onboarded !== profile.stripeConnectOnboarded ||
        chargesEnabled !== profile.chargesEnabled ||
        payoutsEnabled !== profile.payoutsEnabled) {
        await updateTrainerProfile(userId, {
            stripeConnectOnboarded: onboarded,
            chargesEnabled,
            payoutsEnabled,
        });
    }
    let dashboardUrl;
    if (onboarded) {
        try {
            const loginLink = await stripe.accounts.createLoginLink(profile.stripeConnectAccountId);
            dashboardUrl = loginLink.url;
        }
        catch {
            // login links may fail for incomplete accounts
        }
    }
    return { onboarded, chargesEnabled, payoutsEnabled, dashboardUrl };
}
export async function syncConnectAccountFromWebhook(account) {
    const trainerId = account.metadata?.trainerId;
    const userId = account.metadata?.userId;
    if (!userId)
        return;
    const chargesEnabled = Boolean(account.charges_enabled);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    await updateTrainerProfile(userId, {
        stripeConnectAccountId: account.id,
        stripeConnectOnboarded: chargesEnabled && payoutsEnabled,
        chargesEnabled,
        payoutsEnabled,
    });
    if (trainerId) {
        // metadata preserved for debugging
    }
}
export async function createBookingPaymentIntent(params) {
    const stripe = getStripe();
    if (!stripe)
        throw new Error('Stripe is not configured');
    const platformFeePence = Math.round((params.amountPence * getPlatformCommissionPercent()) / 100);
    const intent = await stripe.paymentIntents.create({
        amount: params.amountPence,
        currency: 'gbp',
        application_fee_amount: platformFeePence,
        transfer_data: { destination: params.trainerConnectAccountId },
        metadata: {
            bookingId: params.bookingId,
            trainerId: params.trainerId,
            memberId: params.memberId,
        },
    });
    if (!intent.client_secret) {
        throw new Error('PaymentIntent missing client_secret');
    }
    return {
        paymentIntentId: intent.id,
        clientSecret: intent.client_secret,
        platformFeePence,
    };
}
