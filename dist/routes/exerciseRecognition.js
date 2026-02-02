import axios from 'axios';
import express from 'express';
import { analyzeExerciseImage } from '../services/exerciseRecognition.js';
const router = express.Router();
router.post('/enhance', async (req, res) => {
    console.log('🏋️ EXERCISE ENHANCEMENT REQUEST RECEIVED');
    console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
    try {
        const requestedLimit = req.body.limit || 100;
        const limit = Math.min(Math.max(1, requestedLimit), 500);
        const offset = req.body.offset || 0;
        console.log(`🔢 Limit calculation: requestedLimit=${requestedLimit}, final limit=${limit}, offset=${offset}`);
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
        console.log(`🔍 ExercisesDB appears to cap at 10 exercises per request. Implementing pagination...`);
        const EXERCISES_DB_PAGE_SIZE = 10;
        const allExercises = [];
        let currentOffset = offset;
        let hasMore = true;
        let rateLimitError = null;
        while (allExercises.length < limit && hasMore) {
            const remainingNeeded = limit - allExercises.length;
            const requestLimit = Math.min(EXERCISES_DB_PAGE_SIZE, remainingNeeded);
            console.log(`📥 Fetching page: offset=${currentOffset}, limit=${requestLimit} (total collected: ${allExercises.length}/${limit})`);
            try {
                const apiUrl = `https://exercisedb.p.rapidapi.com/exercises?limit=${requestLimit}&offset=${currentOffset}`;
                console.log(`🌐 API Request URL: ${apiUrl}`);
                console.log(`🔑 Using RapidAPI Key: ${RAPID_API_KEY ? RAPID_API_KEY.substring(0, 10) + '...' : 'MISSING'}`);
                const exerciseDBResponse = await axios.get(apiUrl, {
                    headers: {
                        'X-RapidAPI-Key': RAPID_API_KEY,
                        'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
                    },
                    validateStatus: (status) => status < 500
                });
                console.log(`📊 HTTP Status: ${exerciseDBResponse.status} ${exerciseDBResponse.statusText}`);
                console.log(`📋 Response Headers:`, JSON.stringify(exerciseDBResponse.headers, null, 2));
                const rateLimitRemaining = exerciseDBResponse.headers['x-ratelimit-remaining'];
                const rateLimitReset = exerciseDBResponse.headers['x-ratelimit-reset'];
                if (rateLimitRemaining !== undefined) {
                    console.log(`⏱️ Rate Limit Remaining: ${rateLimitRemaining}`);
                }
                if (rateLimitReset !== undefined) {
                    console.log(`⏰ Rate Limit Resets At: ${rateLimitReset}`);
                }
                // Handle different status codes
                if (exerciseDBResponse.status === 429) {
                    console.error(`🚫 RATE LIMIT EXCEEDED (429): Too many requests`);
                    console.error(`📄 Response data:`, JSON.stringify(exerciseDBResponse.data, null, 2));
                    rateLimitError = {
                        status: 429,
                        message: 'RapidAPI rate limit exceeded. Please upgrade your plan or wait for quota reset.',
                        data: exerciseDBResponse.data
                    };
                    hasMore = false;
                    break;
                }
                if (exerciseDBResponse.status === 403) {
                    console.error(`🚫 FORBIDDEN (403): Plan limit exceeded or invalid API key`);
                    console.error(`📄 Response data:`, JSON.stringify(exerciseDBResponse.data, null, 2));
                    rateLimitError = {
                        status: 403,
                        message: 'RapidAPI plan quota exhausted. Please upgrade your plan.',
                        data: exerciseDBResponse.data
                    };
                    hasMore = false;
                    break;
                }
                if (exerciseDBResponse.status !== 200) {
                    console.error(`⚠️ Unexpected status code: ${exerciseDBResponse.status}`);
                    console.error(`📄 Response data:`, JSON.stringify(exerciseDBResponse.data, null, 2));
                }
                const pageExercises = exerciseDBResponse.data || [];
                if (pageExercises && typeof pageExercises === 'object' && !Array.isArray(pageExercises)) {
                    if (pageExercises.message || pageExercises.error) {
                        console.error(`❌ API Error Response:`, JSON.stringify(pageExercises, null, 2));
                        hasMore = false;
                        break;
                    }
                }
                console.log(`✅ Page fetched: ${pageExercises.length} exercises (offset=${currentOffset})`);
                console.log(`📦 Response type: ${Array.isArray(pageExercises) ? 'Array' : typeof pageExercises}`);
                if (pageExercises.length === 0) {
                    hasMore = false;
                    console.log(`📭 No more exercises available (empty page at offset=${currentOffset})`);
                }
                else {
                    allExercises.push(...pageExercises);
                    currentOffset += pageExercises.length;
                    if (pageExercises.length < requestLimit) {
                        hasMore = false;
                        console.log(`📭 Reached end of exercises (got ${pageExercises.length}, expected ${requestLimit})`);
                    }
                }
            }
            catch (error) {
                console.error(`❌ Error fetching page at offset=${currentOffset}:`);
                console.error(`   Error message: ${error.message}`);
                console.error(`   Error code: ${error.code || 'N/A'}`);
                if (error.response) {
                    console.error(`   HTTP Status: ${error.response.status} ${error.response.statusText}`);
                    console.error(`   Response data:`, JSON.stringify(error.response.data, null, 2));
                    console.error(`   Response headers:`, JSON.stringify(error.response.headers, null, 2));
                    if (error.response.status === 429) {
                        console.error(`🚫 RATE LIMIT EXCEEDED: Too many requests to ExerciseDB API`);
                        rateLimitError = {
                            status: 429,
                            message: 'RapidAPI rate limit exceeded. Please upgrade your plan or wait for quota reset.',
                            data: error.response.data
                        };
                    }
                    if (error.response.status === 403) {
                        console.error(`🚫 FORBIDDEN: Plan limit exceeded or invalid API key`);
                        rateLimitError = {
                            status: 403,
                            message: 'RapidAPI plan quota exhausted. Please upgrade your plan.',
                            data: error.response.data
                        };
                    }
                }
                else if (error.request) {
                    console.error(`   No response received. Request details:`, JSON.stringify(error.request, null, 2));
                }
                hasMore = false;
                break;
            }
        }
        const exercises = allExercises.slice(0, limit);
        console.log(`✅ Total fetched: ${exercises.length} exercises from ExerciseDB (requested: ${limit})`);
        console.log(`📊 Pagination: Made ${Math.ceil(exercises.length / EXERCISES_DB_PAGE_SIZE)} requests`);
        if (rateLimitError) {
            console.error(`⚠️ Rate limit error detected, returning error response to client`);
            return res.status(rateLimitError.status).json({
                success: false,
                message: rateLimitError.message,
                error: 'RapidAPI quota exceeded',
                details: rateLimitError.data,
                exercises: [],
                count: 0
            });
        }
        if (exercises.length === 0) {
            console.error(`⚠️ WARNING: No exercises fetched! This could indicate:`);
            console.error(`   1. Rate limit exceeded (429)`);
            console.error(`   2. Plan quota exhausted (403)`);
            console.error(`   3. API key invalid or missing`);
            console.error(`   4. Network/connectivity issue`);
            // Return a more informative error if no exercises were fetched
            return res.status(503).json({
                success: false,
                message: 'Unable to fetch exercises from ExerciseDB API. Please check your RapidAPI plan status.',
                error: 'No exercises returned from API',
                exercises: [],
                count: 0
            });
        }
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
        console.log('📦 Preparing final response...');
        console.log(`   Enhanced exercises count: ${enhancedExercises.length}`);
        console.log(`   Original exercises count: ${exercises.length}`);
        const actualFetched = exercises.length;
        const hasMoreExercises = actualFetched === limit && hasMore;
        const responsePayload = {
            success: true,
            message: `Successfully enhanced ${enhancedExercises.length} exercises`,
            exercises: enhancedExercises,
            count: enhancedExercises.length,
            pagination: {
                limit,
                offset,
                hasMore: hasMoreExercises,
                nextOffset: hasMoreExercises ? offset + actualFetched : null
            }
        };
        console.log('📤 Sending response:', JSON.stringify({
            success: responsePayload.success,
            message: responsePayload.message,
            count: responsePayload.count,
            pagination: responsePayload.pagination,
            exercisesSample: enhancedExercises.length > 0 ? enhancedExercises.slice(0, 2).map((e) => ({ id: e.id, name: e.name })) : []
        }, null, 2));
        res.json(responsePayload);
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
