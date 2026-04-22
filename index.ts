import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { connectToMongo } from './config/mongoClient.js';

import activityRoutes from './routes/activity.js';
import authRoutes from './routes/auth.js';
import exerciseRecognitionRoutes from './routes/exerciseRecognition.js';
import exercisesRoutes from './routes/exercises.js';
import favoritesRoutes from './routes/favorites.js';
import historyRoutes from './routes/history.js';
import stepsRoutes from './routes/steps.js';
import userRoutes from './routes/user.js';
import userStatsRoutes from './routes/userStats.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.use('/auth', authRoutes);
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

