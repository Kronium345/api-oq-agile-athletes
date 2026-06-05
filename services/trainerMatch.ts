import { getUserById } from '../models/user.ts';
import { listPublishedTrainers } from '../models/trainerProfile.ts';
import { generateCohereReply } from './cohereChat.ts';
import { geocodeUkPostcode } from '../utils/geocode.ts';
import { toTrainerListItem } from '../utils/trainerResponse.ts';

const GOAL_KEYWORD_SPECIALTIES: Record<string, string[]> = {
  weight: ['Weight Loss', 'Fat Loss', 'Nutrition'],
  fat: ['Fat Loss', 'Weight Loss'],
  muscle: ['Strength', 'Hypertrophy', 'Bodybuilding'],
  strength: ['Strength', 'Powerlifting'],
  cardio: ['Cardio', 'Endurance', 'Running'],
  run: ['Running', 'Endurance'],
  yoga: ['Yoga', 'Flexibility', 'Mobility'],
  flex: ['Flexibility', 'Mobility', 'Yoga'],
  rehab: ['Rehabilitation', 'Injury Recovery'],
  injury: ['Injury Recovery', 'Rehabilitation'],
  hiit: ['HIIT', 'Functional Training'],
  sport: ['Sports Performance', 'Athletic Training'],
  nutrition: ['Nutrition', 'Weight Loss'],
  beginner: ['Beginner Friendly', 'General Fitness'],
};

function specialtiesFromGoal(goal: string): string[] {
  const lower = goal.toLowerCase();
  const found = new Set<string>();
  for (const [keyword, specs] of Object.entries(GOAL_KEYWORD_SPECIALTIES)) {
    if (lower.includes(keyword)) {
      specs.forEach((s) => found.add(s));
    }
  }
  return [...found];
}

function fallbackExplanations(
  trainers: ReturnType<typeof toTrainerListItem>[],
  goal: string
): string[] {
  return trainers.map(
    (t) =>
      `${t.displayName} at ${t.gymName} matches your goal "${goal}" with specialties in ${t.specialties.slice(0, 2).join(', ') || 'general fitness'}.`
  );
}

export interface MatchTrainersInput {
  userId: string;
  goal: string;
  budget?: string;
  postcode?: string;
  trainingStyle?: string;
  experience?: string;
}

export async function matchTrainers(input: MatchTrainersInput): Promise<{
  trainers: ReturnType<typeof toTrainerListItem>[];
  explanations: string[];
}> {
  const user = await getUserById(input.userId);
  const memberPostcode =
    input.postcode?.trim() ||
    (typeof user?.postcode === 'string' ? user.postcode : undefined);

  let nearLat: number | undefined;
  let nearLng: number | undefined;
  if (memberPostcode) {
    const geo = await geocodeUkPostcode(memberPostcode);
    if (geo) {
      nearLat = geo.lat;
      nearLng = geo.lng;
    }
  } else if (user?.location && typeof user.location === 'object') {
    const loc = user.location as { coordinates?: number[] };
    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
      nearLng = loc.coordinates[0];
      nearLat = loc.coordinates[1];
    }
  }

  const goalText = [input.goal, input.trainingStyle].filter(Boolean).join(' ');
  const inferredSpecialties = specialtiesFromGoal(goalText);

  let candidates = await listPublishedTrainers({
    nearLat,
    nearLng,
    radiusKm: nearLat != null ? 25 : undefined,
    limit: 15,
  });

  if (inferredSpecialties.length) {
    const specialtyMatches = candidates.filter((t) =>
      t.specialties.some((s) =>
        inferredSpecialties.some((inf) => s.toLowerCase().includes(inf.toLowerCase()))
      )
    );
    if (specialtyMatches.length) {
      candidates = specialtyMatches;
    }
  }

  const top = candidates.slice(0, 3);
  const trainers = top.map((t) =>
    toTrainerListItem(t, { distanceKm: t.distanceKm })
  );

  let explanations: string[] = [];

  if (trainers.length && process.env.COHERE_API_KEY?.trim()) {
    try {
      const trainerSummary = trainers
        .map(
          (t, i) =>
            `${i + 1}. ${t.displayName} — ${t.gymName}, specialties: ${t.specialties.join(', ')}, rating: ${t.ratingAvg ?? 'N/A'}`
        )
        .join('\n');

      const memberContext = [
        `Goal: ${input.goal}`,
        input.budget ? `Budget: ${input.budget}` : null,
        input.trainingStyle ? `Style: ${input.trainingStyle}` : null,
        input.experience || user?.experience ? `Experience: ${input.experience || user?.experience}` : null,
        user?.gymName ? `Gym: ${user.gymName}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const prompt = `You are a fitness matchmaker. Given this member profile and trainer options, write exactly ${trainers.length} short explanations (one sentence each, no numbering) for why each trainer is a good match. Return ONLY the explanations, one per line.

Member:
${memberContext}

Trainers:
${trainerSummary}`;

      const { text } = await generateCohereReply({ prompt });
      const lines = text
        .split('\n')
        .map((l) => l.replace(/^\d+[\).\s-]+/, '').trim())
        .filter(Boolean);
      if (lines.length >= trainers.length) {
        explanations = lines.slice(0, trainers.length);
      } else if (lines.length > 0) {
        explanations = [
          ...lines,
          ...fallbackExplanations(trainers.slice(lines.length), input.goal),
        ];
      }
    } catch (err) {
      console.warn('[trainer-match] Cohere ranking failed, using fallback:', (err as Error).message);
    }
  }

  if (!explanations.length) {
    explanations = fallbackExplanations(trainers, input.goal);
  }

  return { trainers, explanations };
}
