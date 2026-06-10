import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { connectToMongo } from "./config/mongoClient.js";
import { checkFoodVisionReady, getFoodVisionProvider, } from "./services/foodVisionClient.js";
import { ensureQuizDataSeeded, getQuizBootstrapStatus } from "./services/quizBootstrap.js";
import { ensureTrainerDataSeeded } from "./services/trainerBootstrap.js";
import { buildDeleteAccountPlayStoreHtml } from "./deleteAccountPage.js";
import { verifyEmailTransport } from "./config/nodemailer.js";
import { welcomeEmailLogoUrl } from "./utils/send-email.js";
import { ensureUserIndexes } from "./models/user.js";
import { ensureTrainerProfileIndexes } from "./models/trainerProfile.js";
import { ensureFitnessGroupIndexes } from "./models/fitnessGroup.js";
import { ensureTrainerReviewIndexes } from "./models/trainerReview.js";
import analyzeFoodRoutes from "./routes/analyzeFood.js";
import aiChatRoutes from "./routes/aiChat.js";
import activityRoutes from "./routes/activity.js";
import caloriePreferencesRoutes from "./routes/caloriePreferences.js";
import foodLogRoutes from "./routes/foodLog.js";
import foodScanRoutes from "./routes/foodScan.js";
import authRoutes from "./routes/auth.js";
import quizRoutes from "./routes/quiz.js";
import exerciseRecognitionRoutes from "./routes/exerciseRecognition.js";
import exercisesRoutes from "./routes/exercises.js";
import favoritesRoutes from "./routes/favorites.js";
import historyRoutes from "./routes/history.js";
import stepsRoutes from "./routes/steps.js";
import userRoutes from "./routes/user.js";
import userStatsRoutes from "./routes/userStats.js";
import bookingsRoutes from "./routes/bookings.js";
import communityRoutes from "./routes/community.js";
import stripeWebhookRoutes from "./routes/stripeWebhook.js";
import trainersRoutes from "./routes/trainers.js";
import workflowRoutes from "./routes/workflow.js";
import formCoachRoutes from "./routes/formCoach.js";
import { checkFormCoachReady } from "./services/formCoachClient.js";
import { logQstashStartup } from "./utils/upstashEnv.js";
const app = express();
const PORT = process.env.PORT || 4000;
app.use(cors());
// Stripe webhooks need raw body — register before JSON parser
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRoutes);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'API is running' });
});
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});
/** Google Play–style public URL: browser GET must return HTML, not JSON. */
app.get('/delete-account', (_req, res) => {
    res.type('html').send(buildDeleteAccountPlayStoreHtml());
});
app.use('/auth', authRoutes);
app.use('/chat', aiChatRoutes);
app.use('/quiz', quizRoutes);
app.use('/food', foodLogRoutes);
app.use('/foodScan', foodScanRoutes);
app.use('/preferences', caloriePreferencesRoutes);
app.use('/analyze-food', analyzeFoodRoutes);
app.use('/api/steps', stepsRoutes);
app.use('/api/exercises', exercisesRoutes);
app.use('/api/exercise-recognition', exerciseRecognitionRoutes);
app.use('/api/form-coach', formCoachRoutes);
app.use('/history', historyRoutes);
app.use('/favorites', favoritesRoutes);
app.use('/user', userRoutes);
app.use('/user-stats', userStatsRoutes);
app.use('/workflow', workflowRoutes);
app.use('/activity', activityRoutes);
app.use('/trainers', trainersRoutes);
app.use('/bookings', bookingsRoutes);
app.use('/community', communityRoutes);
app.use('/uploads', express.static('uploads'));
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});
async function startServer() {
    try {
        await connectToMongo();
        await ensureUserIndexes();
        await ensureTrainerProfileIndexes();
        await ensureTrainerReviewIndexes();
        await ensureFitnessGroupIndexes();
        verifyEmailTransport();
        const welcomeLogo = welcomeEmailLogoUrl();
        if (welcomeLogo) {
            console.log('[email] welcome logo enabled');
        }
        else if (process.env.WELCOME_EMAIL_LOGO_URL?.trim()) {
            console.warn('[email] WELCOME_EMAIL_LOGO_URL set but invalid — welcome email will omit banner');
        }
        logQstashStartup();
        await ensureQuizDataSeeded();
        const quizStatus = await getQuizBootstrapStatus();
        console.log('[quiz] Mind Center ready:', {
            questions: quizStatus.questionsCount,
            categories: quizStatus.categoriesCount,
            readyForQuizUi: quizStatus.readyForQuizUi,
            readyForPredict: quizStatus.readyForPredict,
        });
        const trainerSeed = await ensureTrainerDataSeeded();
        console.log('[trainers] PT Network seed:', {
            enabled: trainerSeed.enabled,
            trainersSeeded: trainerSeed.trainersSeeded,
            publishedTrainerCount: trainerSeed.trainerCount,
            groupsSeeded: trainerSeed.groupsSeeded,
            groupCount: trainerSeed.groupCount,
        });
        const foodVisionProvider = getFoodVisionProvider();
        if (foodVisionProvider === 'http') {
            const ready = await checkFoodVisionReady();
            console.log('[food-vision] provider=http', { ready });
            if (!ready) {
                console.warn('[food-vision] Python service /ready is not 200 yet (cold start). Food scans may return 503 until the model loads.');
            }
        }
        else {
            console.log('[food-vision] provider=clarifai');
        }
        if (process.env.FORM_COACH_API_URL?.trim()) {
            const formCoachReady = await checkFormCoachReady();
            console.log('[form-coach] service configured:', { ready: formCoachReady });
            if (!formCoachReady) {
                console.warn('[form-coach] Python service /health is not OK yet (Render cold start). Analysis may fail until it wakes.');
            }
        }
        else {
            console.log('[form-coach] FORM_COACH_API_URL not set — form analysis disabled');
        }
        const server = app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`[server] Port ${PORT} is already in use. Another Node process is still running.`, `Find it: netstat -ano | findstr :${PORT}  then: taskkill /PID <pid> /F`);
            }
            else {
                console.error('[server] listen failed:', err.message);
            }
            process.exit(1);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
}
startServer();
export default app;
