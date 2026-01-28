import axios from 'axios';

const CLARIFAI_API_KEY = process.env.FitnessOnePAT || '';
const CLARIFAI_API_URL = 'https://api.clarifai.com/v2/models/general-image-recognition/outputs';

// Exercise keywords for matching and filtering
export const exerciseKeywords = [
  // Bodyweight exercises
  'pushup', 'push up', 'push-up', 'pullup', 'pull up', 'pull-up', 'squat', 'lunge', 'plank', 'burpee',
  'situp', 'sit up', 'sit-up', 'crunch', 'jumping jack', 'mountain climber',
  
  // Weightlifting
  'deadlift', 'bench press', 'shoulder press', 'bicep curl', 'tricep', 'dumbbell', 'barbell',
  'kettlebell', 'overhead press', 'military press', 'chest press',
  
  // Cardio
  'running', 'jogging', 'cycling', 'rowing', 'jump rope', 'jumping', 'treadmill',
  
  // Equipment
  'dumbbell', 'barbell', 'kettlebell', 'resistance band', 'medicine ball', 'cable',
  'pull up bar', 'dip bar', 'bench', 'rack', 'gym equipment',
  
  // Yoga & Flexibility
  'yoga', 'stretch', 'downward dog', 'warrior pose', 'tree pose', 'cobra',
  
  // General fitness terms
  'exercise', 'workout', 'training', 'fitness', 'gym', 'muscle', 'strength',
  'cardio', 'athletic', 'sport', 'weightlifting'
];

// Body part mapping
const bodyPartMap: Record<string, string> = {
  'arm': 'upper arms',
  'bicep': 'upper arms',
  'tricep': 'upper arms',
  'shoulder': 'shoulders',
  'chest': 'chest',
  'back': 'back',
  'leg': 'legs',
  'thigh': 'upper legs',
  'calf': 'lower legs',
  'glute': 'glutes',
  'core': 'waist',
  'ab': 'waist',
  'stomach': 'waist',
  'neck': 'neck'
};

// Equipment mapping
const equipmentMap: Record<string, string> = {
  'dumbbell': 'dumbbell',
  'barbell': 'barbell',
  'kettlebell': 'kettlebell',
  'band': 'resistance band',
  'resistance': 'resistance band',
  'medicine ball': 'medicine ball',
  'cable': 'cable',
  'bodyweight': 'body weight',
  'mat': 'mat',
  'bench': 'bench'
};

interface ClarifaiConcept {
  name: string;
  value: number; // Confidence score 0-1
}

interface RecognizedExercise {
  id: string;
  name: string;
  gifUrl: string;
  bodyPart: string;
  equipment: string;
  target: string;
  instructions: string[];
  secondaryMuscles: string[];
}

/**
 * Analyze image using Clarifai general-image-recognition model
 */
export const analyzeExerciseImage = async (imageBase64: string): Promise<RecognizedExercise[]> => {
  console.log('🔍 CLARIFAI EXERCISE ANALYSIS STARTED');
  
  try {
    // Clean base64 data
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    console.log('📡 Calling Clarifai API...');
    
    const response = await axios({
      method: 'POST',
      url: CLARIFAI_API_URL,
      headers: {
        'Authorization': `Key ${CLARIFAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        user_app_id: {
          user_id: "clarifai",  
          app_id: "main"        
        },
        inputs: [
          {
            data: {
              image: {
                base64: cleanBase64
              }
            }
          }
        ]
      }
    });

    console.log('✅ Clarifai response received');

    // Extract concepts from response
    const concepts: ClarifaiConcept[] = response.data.outputs[0].data.concepts;
    console.log(`🏋️ Found ${concepts.length} initial concepts`);

    // Filter for exercise-related concepts
    const exerciseConcepts = concepts.filter(concept => {
      const conceptName = concept.name.toLowerCase();
      
      // Check if concept matches any exercise keyword
      const matchesKeyword = exerciseKeywords.some(keyword => 
        conceptName.includes(keyword) || keyword.includes(conceptName)
      );
      
      // Require high confidence (80%) or keyword match with 50% confidence
      const hasGoodConfidence = concept.value >= 0.8 || 
        (matchesKeyword && concept.value >= 0.5);
      
      return matchesKeyword && hasGoodConfidence;
    });

    console.log(`✨ Filtered to ${exerciseConcepts.length} exercise-related concepts`);

    // Transform concepts into exercise data format (matching ExerciseDB structure)
    const recognizedExercises = exerciseConcepts.map((concept, index) => 
      generateExerciseData(concept, index)
    );

    console.log(`💪 Generated ${recognizedExercises.length} exercise items`);
    return recognizedExercises;
    
  } catch (error: any) {
    console.error('💥 Clarifai analysis failed:', error.response?.data || error.message);
    throw new Error('Failed to analyze exercise image');
  }
};


const generateExerciseData = (concept: ClarifaiConcept, index: number): RecognizedExercise => {
  const exerciseName = concept.name;
  const normalizedName = exerciseName.toLowerCase();
  
  // Generate unique ID (format: recognized-{timestamp}-{index})
  const id = `recognized-${Date.now()}-${index}`;
  
  // Determine body part
  const bodyPart = determineBodyPart(normalizedName);
  
  // Determine equipment
  const equipment = determineEquipment(normalizedName);
  
  // Determine target muscle
  const target = determineTargetMuscle(normalizedName, bodyPart);
  
  // Generate instructions
  const instructions = generateInstructions(exerciseName, bodyPart, equipment);
  
  // Determine secondary muscles
  const secondaryMuscles = getSecondaryMuscles(bodyPart);
  
  // Construct image URL (use a placeholder or attempt to match with Exercises11)
  const gifUrl = `https://exercises11.p.rapidapi.com/images/${id}.gif`;
  
  return {
    id,
    name: formatExerciseName(exerciseName),
    gifUrl,
    bodyPart,
    equipment,
    target,
    instructions,
    secondaryMuscles
  };
};

/**
 * Determine body part from exercise name
 */
const determineBodyPart = (name: string): string => {
  for (const [key, value] of Object.entries(bodyPartMap)) {
    if (name.includes(key)) {
      return value;
    }
  }
  
  // Default mappings based on common exercises
  if (name.includes('squat') || name.includes('lunge')) return 'legs';
  if (name.includes('press') || name.includes('pushup')) return 'chest';
  if (name.includes('curl')) return 'upper arms';
  if (name.includes('row') || name.includes('pullup')) return 'back';
  if (name.includes('plank') || name.includes('crunch')) return 'waist';
  
  return 'full body';
};

/**
 * Determine equipment from exercise name
 */
const determineEquipment = (name: string): string => {
  for (const [key, value] of Object.entries(equipmentMap)) {
    if (name.includes(key)) {
      return value;
    }
  }
  
  // Default to body weight if no equipment detected
  return 'body weight';
};

/**
 * Determine target muscle from exercise name and body part
 */
const determineTargetMuscle = (name: string, bodyPart: string): string => {
  if (name.includes('bicep')) return 'biceps';
  if (name.includes('tricep')) return 'triceps';
  if (name.includes('chest') || name.includes('press')) return 'pectorals';
  if (name.includes('shoulder')) return 'delts';
  if (name.includes('back') || name.includes('row')) return 'lats';
  if (name.includes('squat')) return 'quads';
  if (name.includes('deadlift')) return 'glutes';
  if (name.includes('ab') || name.includes('crunch')) return 'abs';
  if (name.includes('calf')) return 'calves';
  
  // Default based on body part
  const targetMap: Record<string, string> = {
    'chest': 'pectorals',
    'back': 'lats',
    'shoulders': 'delts',
    'upper arms': 'biceps',
    'legs': 'quads',
    'waist': 'abs',
    'glutes': 'glutes'
  };
  
  return targetMap[bodyPart] || 'full body';
};

/**
 * Generate exercise instructions
 */
const generateInstructions = (name: string, bodyPart: string, equipment: string): string[] => {
  const formattedName = formatExerciseName(name);
  
  return [
    `Position yourself correctly for the ${formattedName}.`,
    `Maintain proper form throughout the movement, focusing on controlled motion.`,
    `Engage your ${bodyPart} muscles as you perform the exercise.`,
    `${equipment !== 'body weight' ? `Ensure you have a secure grip on the ${equipment}.` : 'Use your bodyweight as resistance.'}`,
    `Breathe steadily - exhale during exertion, inhale during recovery.`,
    `Complete the desired number of repetitions with good form.`
  ];
};

/**
 * Get secondary muscles based on primary body part
 */
const getSecondaryMuscles = (bodyPart: string): string[] => {
  const secondaryMap: Record<string, string[]> = {
    'chest': ['shoulders', 'triceps'],
    'back': ['biceps', 'rear delts'],
    'shoulders': ['triceps', 'upper chest'],
    'upper arms': ['forearms', 'shoulders'],
    'legs': ['glutes', 'hamstrings', 'calves'],
    'waist': ['obliques', 'lower back'],
    'glutes': ['hamstrings', 'lower back']
  };
  
  return secondaryMap[bodyPart] || ['core'];
};

/**
 * Format exercise name for display
 */
const formatExerciseName = (name: string): string => {
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

