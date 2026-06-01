import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { connectToMongo } from './config/mongoClient.ts';
import {
  checkFoodVisionReady,
  getFoodVisionProvider,
} from './services/foodVisionClient.ts';
import { ensureQuizDataSeeded, getQuizBootstrapStatus } from './services/quizBootstrap.ts';
import { buildDeleteAccountPlayStoreHtml } from './deleteAccountPage.ts';

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

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
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
app.use('/activity', activityRoutes);
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
    await ensureQuizDataSeeded();
    const quizStatus = await getQuizBootstrapStatus();
    console.log('[quiz] Mind Center ready:', {
      questions: quizStatus.questionsCount,
      categories: quizStatus.categoriesCount,
      readyForQuizUi: quizStatus.readyForQuizUi,
      readyForPredict: quizStatus.readyForPredict,
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

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error: any) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

export default app;

