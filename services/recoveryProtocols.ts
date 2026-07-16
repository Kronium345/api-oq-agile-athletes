/**
 * Static Recovery Toolkit protocol catalog (MVP).
 * Wellness framing only — no medical claims in copy.
 */

export type EvidenceStrength = 'high' | 'moderate' | 'limited' | 'emerging';

export interface BreathingRhythm {
  inhaleSec: number;
  holdInSec: number;
  exhaleSec: number;
  holdOutSec: number;
}

export interface BreathingProtocol {
  id: string;
  name: string;
  description: string;
  intendedUse: string[];
  rhythm: BreathingRhythm;
  durationOptionsSec: number[];
  defaultDurationSec: number;
  difficulty: 'beginner' | 'intermediate';
  evidenceStrength: EvidenceStrength;
  contraindications: string[];
  coachingTips: string[];
  whyRecommended: string;
  disclaimer: string;
}

export const RECOVERY_DISCLAIMER =
  'This guided breathing exercise is for general wellness only. It is not medical treatment. Stop anytime if you feel dizzy or unwell, and seek professional support if symptoms worsen.';

export const BREATHING_PROTOCOLS: BreathingProtocol[] = [
  {
    id: 'stress_reset',
    name: 'Stress Reset',
    description: 'Longer exhales to help you unwind when stress feels high.',
    intendedUse: ['stress', 'overwhelm', 'recovery_day'],
    rhythm: { inhaleSec: 4, holdInSec: 0, exhaleSec: 6, holdOutSec: 0 },
    durationOptionsSec: [60, 120, 180],
    defaultDurationSec: 120,
    difficulty: 'beginner',
    evidenceStrength: 'moderate',
    contraindications: ['Uncontrolled breathing discomfort', 'Recent respiratory distress'],
    coachingTips: ['Sit tall', 'Breathe through the nose if comfortable', 'Stop if dizzy'],
    whyRecommended:
      'This slow-breathing session is designed to help you unwind and may support relaxation. Individual experiences vary, and this tool is intended for general wellness rather than medical treatment.',
    disclaimer: RECOVERY_DISCLAIMER,
  },
  {
    id: 'box_breathing',
    name: 'Box Breathing',
    description: 'Even rhythm to steady attention and calm before a task.',
    intendedUse: ['focus', 'stress', 'pre_workout', 'competition'],
    rhythm: { inhaleSec: 4, holdInSec: 4, exhaleSec: 4, holdOutSec: 4 },
    durationOptionsSec: [60, 120, 180, 300],
    defaultDurationSec: 120,
    difficulty: 'beginner',
    evidenceStrength: 'moderate',
    contraindications: ['Uncontrolled breathing discomfort', 'Recent respiratory distress'],
    coachingTips: ['Keep each side of the “box” even', 'Relax your shoulders', 'Stop if dizzy'],
    whyRecommended:
      'Even, paced breathing may support calm and focus before training or competition. Experiences vary.',
    disclaimer: RECOVERY_DISCLAIMER,
  },
  {
    id: 'physiological_sigh',
    name: 'Physiological Sigh',
    description: 'Double inhale and a long exhale for short stress spikes.',
    intendedUse: ['acute_stress', 'stress'],
    rhythm: { inhaleSec: 2, holdInSec: 0, exhaleSec: 6, holdOutSec: 0 },
    durationOptionsSec: [60, 90, 120],
    defaultDurationSec: 60,
    difficulty: 'beginner',
    evidenceStrength: 'emerging',
    contraindications: ['Uncontrolled breathing discomfort', 'Recent respiratory distress'],
    coachingTips: [
      'Take a short second inhale at the top',
      'Exhale slowly through the mouth or nose',
      'Stop if dizzy',
    ],
    whyRecommended:
      'A brief double-inhale pattern may help you feel calmer during acute stress. This is a wellness tool, not a medical treatment.',
    disclaimer: RECOVERY_DISCLAIMER,
  },
  {
    id: 'sleep_wind_down',
    name: 'Sleep Wind Down',
    description: 'Longer exhales to support an evening wind-down routine.',
    intendedUse: ['sleep', 'evening'],
    rhythm: { inhaleSec: 4, holdInSec: 0, exhaleSec: 6, holdOutSec: 0 },
    durationOptionsSec: [120, 180, 300],
    defaultDurationSec: 180,
    difficulty: 'beginner',
    evidenceStrength: 'moderate',
    contraindications: ['Uncontrolled breathing discomfort', 'Recent respiratory distress'],
    coachingTips: ['Dim lights if possible', 'Lie down or sit comfortably', 'Stop if dizzy'],
    whyRecommended:
      'Gentle slow breathing before bed may support relaxation as part of a wind-down routine. Results vary by person.',
    disclaimer: RECOVERY_DISCLAIMER,
  },
  {
    id: 'post_workout_recovery',
    name: 'Post-Workout Recovery',
    description: 'A short cool-down breath after training.',
    intendedUse: ['after_training', 'recovery_day'],
    rhythm: { inhaleSec: 4, holdInSec: 0, exhaleSec: 6, holdOutSec: 0 },
    durationOptionsSec: [60, 120, 180],
    defaultDurationSec: 120,
    difficulty: 'beginner',
    evidenceStrength: 'limited',
    contraindications: ['Uncontrolled breathing discomfort', 'Recent respiratory distress'],
    coachingTips: ['Finish your cool-down first', 'Keep intensity low', 'Stop if dizzy'],
    whyRecommended:
      'Slow breathing after training is designed to encourage a recovery habit. It is not a measure of physiological recovery.',
    disclaimer: RECOVERY_DISCLAIMER,
  },
  {
    id: 'pre_workout_focus',
    name: 'Pre-Workout Focus',
    description: 'Short focus rhythm before a session — not designed to sedate.',
    intendedUse: ['pre_workout', 'focus'],
    rhythm: { inhaleSec: 4, holdInSec: 2, exhaleSec: 4, holdOutSec: 0 },
    durationOptionsSec: [60, 90, 120],
    defaultDurationSec: 60,
    difficulty: 'beginner',
    evidenceStrength: 'limited',
    contraindications: ['Uncontrolled breathing discomfort', 'Recent respiratory distress'],
    coachingTips: ['Keep it brief', 'Stay upright', 'Stop if dizzy'],
    whyRecommended:
      'A short paced-breathing set may help you settle attention before training. Evidence in sport contexts is limited; use what feels useful for you.',
    disclaimer: RECOVERY_DISCLAIMER,
  },
];

const BY_ID = new Map(BREATHING_PROTOCOLS.map((p) => [p.id, p]));

export function getBreathingProtocolById(id: string): BreathingProtocol | undefined {
  return BY_ID.get(id);
}

export function isKnownProtocolId(id: string): boolean {
  return BY_ID.has(id);
}

export function listBreathingProtocols(): BreathingProtocol[] {
  return BREATHING_PROTOCOLS;
}
