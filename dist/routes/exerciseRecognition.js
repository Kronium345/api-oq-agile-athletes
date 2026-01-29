import axios from 'axios';
import express from 'express';
import { analyzeExerciseImage } from '../services/exerciseRecognition.js';
const router = express.Router();
router.post('/enhance', async (req, res) => {
    console.log('🏋️ EXERCISE ENHANCEMENT REQUEST RECEIVED');
    try {
        const requestedLimit = req.body.limit || 50;
        const limit = Math.min(Math.max(1, requestedLimit), 200);
        const offset = req.body.offset || 0;
        const RAPID_API_KEY = process.env.RAPID_API_KEY || req.body.apiKey;
        const FITNESS_ONE_PAT = process.env.FitnessOnePAT;
        if (!RAPID_API_KEY) {
            return res.status(400).json({
                success: false,
                message: 'RapidAPI key is required'
            });
        }
        if (!FITNESS_ONE_PAT) {
            console.log('⚠️  WARNING: FitnessOnePAT not found in environment variables');
            console.log('⚠️  Exercises will be returned without AI enhancement');
            console.log('⚠️  Add FitnessOnePAT to server/.env to enable AI analysis');
        }
        console.log(`📡 Fetching ${limit} exercises from ExerciseDB (for metadata)...`);
        const exerciseDBResponse = await axios.get(`https://exercisedb.p.rapidapi.com/exercises?limit=${limit}&offset=${offset}`, {
            headers: {
                'X-RapidAPI-Key': RAPID_API_KEY,
                'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
            }
        });
        const exercises = exerciseDBResponse.data;
        console.log(`✅ Fetched ${exercises.length} exercises from ExerciseDB`);
        console.log('🖼️ Fetching images from Exercises11 and analyzing with Clarifai...');
        const enhancedExercises = await Promise.all(exercises.map(async (exercise) => {
            try {
                // Construct Exercises11 image URL (they host high-quality exercise GIFs)
                const sourceImageUrl = `https://exercises11.p.rapidapi.com/images/${exercise.id}.gif`;
                const proxiedImageUrl = `/api/exercise-recognition/image/${exercise.id}`;
                console.log(`📸 Fetching image for: ${exercise.name} (ID: ${exercise.id})`);
                console.log(`   Source URL: ${sourceImageUrl}`);
                console.log(`   Proxied URL: ${proxiedImageUrl}`);
                // Fetch image from Exercises11 with proper headers
                const imageResponse = await axios.get(sourceImageUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'X-RapidAPI-Key': RAPID_API_KEY,
                        'X-RapidAPI-Host': 'exercises11.p.rapidapi.com'
                    }
                });
                console.log(`✅ Image fetched, analyzing with Clarifai...`);
                const base64Image = Buffer.from(imageResponse.data, 'binary').toString('base64');
                const recognizedData = await analyzeExerciseImage(base64Image);
                if (recognizedData.length > 0) {
                    const clarifaiData = recognizedData[0];
                    console.log(`✨ Enhanced exercise ${exercise.id} with Clarifai data`);
                    return {
                        id: exercise.id,
                        name: exercise.name || clarifaiData.name,
                        gifUrl: proxiedImageUrl,
                        bodyPart: clarifaiData.bodyPart || exercise.bodyPart || 'Not specified',
                        equipment: clarifaiData.equipment || exercise.equipment || 'Not specified',
                        target: clarifaiData.target || exercise.target || 'Not specified',
                        instructions: clarifaiData.instructions || (exercise.instructions ? [exercise.instructions] : ['No instructions available']),
                        secondaryMuscles: clarifaiData.secondaryMuscles || exercise.secondaryMuscles || []
                    };
                }
                return {
                    id: exercise.id,
                    name: exercise.name,
                    gifUrl: proxiedImageUrl,
                    bodyPart: exercise.bodyPart || 'Not specified',
                    equipment: exercise.equipment || 'Not specified',
                    target: exercise.target || 'Not specified',
                    instructions: exercise.instructions || ['No instructions available'],
                    secondaryMuscles: exercise.secondaryMuscles || []
                };
            }
            catch (error) {
                console.error(`⚠️ Failed to enhance exercise ${exercise.id}:`, error.message);
                return {
                    id: exercise.id,
                    name: exercise.name,
                    gifUrl: `/api/exercise-recognition/image/${exercise.id}`,
                    bodyPart: exercise.bodyPart || 'Not specified',
                    equipment: exercise.equipment || 'Not specified',
                    target: exercise.target || 'Not specified',
                    instructions: exercise.instructions || ['No instructions available'],
                    secondaryMuscles: exercise.secondaryMuscles || []
                };
            }
        }));
        console.log('📦 Sending enhanced exercises');
        res.json({
            success: true,
            message: `Successfully enhanced ${enhancedExercises.length} exercises`,
            exercises: enhancedExercises,
            count: enhancedExercises.length,
            pagination: {
                limit,
                offset,
                hasMore: enhancedExercises.length === limit,
                nextOffset: enhancedExercises.length === limit ? offset + limit : null
            }
        });
    }
    catch (error) {
        console.error('💥 Exercise enhancement error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to enhance exercises',
            error: error.message,
            exercises: []
        });
    }
});
router.get('/image/:exerciseId', async (req, res) => {
    try {
        const { exerciseId } = req.params;
        const RAPID_API_KEY = process.env.RAPID_API_KEY;
        if (!RAPID_API_KEY) {
            return res.status(500).json({ error: 'RapidAPI key not configured' });
        }
        const imageUrl = `https://exercises11.p.rapidapi.com/images/${exerciseId}.gif`;
        console.log(`🖼️ Proxying image: ${imageUrl}`);
        // Fetch image with proper headers
        const imageResponse = await axios.get(imageUrl, {
            responseType: 'stream',
            headers: {
                'X-RapidAPI-Key': RAPID_API_KEY,
                'X-RapidAPI-Host': 'exercises11.p.rapidapi.com'
            }
        });
        // Set proper content type
        res.setHeader('Content-Type', 'image/gif');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        // Pipe the image stream to response
        imageResponse.data.pipe(res);
    }
    catch (error) {
        console.error(`❌ Image proxy error for ${req.params.exerciseId}:`, error.message);
        res.status(404).json({ error: 'Image not found' });
    }
});
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'exercise-recognition',
        timestamp: new Date().toISOString()
    });
});
export default router;
