import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { connectToMongo } from './config/mongoClient.ts';
import {
  checkFoodVisionReady,
  getFoodVisionProvider,
} from './services/foodVisionClient.ts';
import { ensureQuizDataSeeded, getQuizBootstrapStatus } from './services/quizBootstrap.ts';
import { ensureTrainerDataSeeded } from './services/trainerBootstrap.ts';
import { buildDeleteAccountPlayStoreHtml } from './deleteAccountPage.ts';
import { verifyEmailTransport } from './config/nodemailer.ts';
import { welcomeEmailLogoUrl } from './utils/send-email.ts';
import { ensureTrainerProfileIndexes } from './models/trainerProfile.ts';
import { ensureFitnessGroupIndexes } from './models/fitnessGroup.ts';
import { ensureTrainerReviewIndexes } from './models/trainerReview.ts';

import analyzeFoodRoutes from './routes/analyzeFood.ts';
import aiChatRoutes from './routes/aiChat.ts';
import activityRoutes from './routes/activity.ts';
import caloriePreferencesRoutes from './routes/caloriePreferences.ts';
import foodLogRoutes from './routes/foodLog.ts';
import foodScanRoutes from './routes/foodScan.ts';
import authRoutes from './routes/auth.ts';
import quizRoutes from './routes/quiz.ts';
import exerciseRecognitionRoutes from './routes/exerciseRecognition.ts';
import exercisesRoutes from './routes/exercises.ts';
import favoritesRoutes from './routes/favorites.ts';
import historyRoutes from './routes/history.ts';
import stepsRoutes from './routes/steps.ts';
import userRoutes from './routes/user.ts';
import userStatsRoutes from './routes/userStats.ts';
import bookingsRoutes from './routes/bookings.ts';
import communityRoutes from './routes/community.ts';
import stripeWebhookRoutes from './routes/stripeWebhook.ts';
import trainersRoutes from './routes/trainers.ts';
import workflowRoutes from './routes/workflow.ts';
import { logQstashStartup } from './utils/upstashEnv.ts';

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

app.use((err: any, req: any, res: any, next: any) => {
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
    await ensureTrainerProfileIndexes();
    await ensureTrainerReviewIndexes();
    await ensureFitnessGroupIndexes();
    verifyEmailTransport();
    const welcomeLogo = welcomeEmailLogoUrl();
    if (welcomeLogo) {
      console.log('[email] welcome logo enabled');
    } else if (process.env.WELCOME_EMAIL_LOGO_URL?.trim()) {
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
        console.warn(
          '[food-vision] Python service /ready is not 200 yet (cold start). Food scans may return 503 until the model loads.'
        );
      }
    } else {
      console.log('[food-vision] provider=clarifai');
    }

    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `[server] Port ${PORT} is already in use. Another Node process is still running.`,
          `Find it: netstat -ano | findstr :${PORT}  then: taskkill /PID <pid> /F`
        );
      } else {
        console.error('[server] listen failed:', err.message);
      }
      process.exit(1);
    });
  } catch (error: any) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

export default app;

