import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from '../config/mongoClient.ts';
import { ensureFitnessGroupIndexes } from '../models/fitnessGroup.ts';
import { ensureTrainerProfileIndexes } from '../models/trainerProfile.ts';
import { toGeoPoint } from '../utils/geocode.ts';

const SEED_MARKER = 'Alex Morgan';

const SEED_TRAINERS = [
  {
    displayName: 'Alex Morgan',
    bio: 'Strength and conditioning coach with 8 years experience helping clients build muscle and confidence.',
    qualifications: ['Level 3 PT', 'CSCS'],
    specialties: ['Strength', 'Hypertrophy', 'Beginner Friendly'],
    gymName: 'PureGym Shoreditch',
    postcode: 'E1 6AN',
    lat: 51.5245,
    lng: -0.0759,
    priceFrom: 45,
    featured: true,
    ratingAvg: 4.8,
    reviewCount: 12,
  },
  {
    displayName: 'Jordan Lee',
    bio: 'HIIT and functional training specialist. Fast, effective sessions for busy professionals.',
    qualifications: ['Level 3 PT', 'CrossFit L1'],
    specialties: ['HIIT', 'Functional Training', 'Weight Loss'],
    gymName: 'The Gym Group Whitechapel',
    postcode: 'E1 1DU',
    lat: 51.5174,
    lng: -0.0657,
    priceFrom: 40,
    featured: false,
    ratingAvg: 4.5,
    reviewCount: 8,
  },
  {
    displayName: 'Sam Patel',
    bio: 'Running coach and endurance expert. From couch to 5K to marathon prep.',
    qualifications: ['Level 3 PT', 'UK Athletics Coach'],
    specialties: ['Running', 'Endurance', 'Cardio'],
    gymName: 'Virgin Active Moorgate',
    postcode: 'EC2Y 9AE',
    lat: 51.5186,
    lng: -0.0886,
    priceFrom: 55,
    featured: true,
    ratingAvg: 4.9,
    reviewCount: 21,
  },
  {
    displayName: 'Taylor Brooks',
    bio: 'Yoga and mobility coach focused on injury prevention and flexibility.',
    qualifications: ['Level 3 PT', '200hr Yoga TT'],
    specialties: ['Yoga', 'Flexibility', 'Mobility', 'Rehabilitation'],
    gymName: 'Third Space City',
    postcode: 'EC2V 6DL',
    lat: 51.5155,
    lng: -0.0922,
    priceFrom: 50,
    featured: false,
    ratingAvg: 4.7,
    reviewCount: 15,
  },
  {
    displayName: 'Casey Wright',
    bio: 'Sports performance coach working with amateur athletes across London.',
    qualifications: ['Level 4 PT', 'Sports Massage'],
    specialties: ['Sports Performance', 'Athletic Training', 'Strength'],
    gymName: 'Fitness First Bishopsgate',
    postcode: 'EC2M 4QH',
    lat: 51.5189,
    lng: -0.0795,
    priceFrom: 60,
    featured: false,
    ratingAvg: 4.6,
    reviewCount: 9,
  },
];

/** Verified London run clubs — sourced from official club pages (see sourceUrl). */
const VERIFIED_LAST = '2026-06';

const LEGACY_FICTIONAL_GROUP_IDS = ['grp_1', 'grp_2', 'grp_3'];
const LEGACY_FICTIONAL_GROUP_NAMES = [
  'Aldgate Morning Run Club',
  'East London Run Club',
  'City HIIT Crew',
];

const SEED_GROUPS = [
  {
    groupId: 'grp_gymshark_run_london',
    name: 'Gymshark Run Club London',
    description:
      'Weekly community 5K from Gymshark Regent Street. Open to all paces — check Gymshark for the latest session details.',
    gymName: 'Gymshark Regent Street',
    postcode: 'W1S 3BE',
    city: 'London',
    category: 'Running',
    lat: 51.5132,
    lng: -0.1394,
    scheduleSummary: 'Tuesdays 18:30',
    memberCount: 0,
    verified: true,
    source: 'official',
    lastVerified: VERIFIED_LAST,
    sourceUrl: 'https://uk.gymshark.com/blog/article/gymshark-run-club',
  },
  {
    groupId: 'grp_wandsworth_running_club',
    name: 'Wandsworth Running Club',
    description:
      'Friendly local club with Thursday evening runs and Sunday social sessions around Wandsworth Park.',
    gymName: 'Wandsworth Park area',
    postcode: 'SW18 4DG',
    city: 'London',
    category: 'Running',
    lat: 51.463,
    lng: -0.195,
    scheduleSummary: 'Thu 19:00, Sun social run',
    memberCount: 0,
    verified: true,
    source: 'official',
    lastVerified: VERIFIED_LAST,
    sourceUrl: 'https://www.wandsworthrunningclub.com/',
  },
  {
    groupId: 'grp_tooting_run_club',
    name: 'Tooting Run Club',
    description:
      'Monday evening sessions at Tooting Bec Athletics Track. Affiliated with Herne Hill Harriers.',
    gymName: 'Tooting Bec Athletics Track',
    postcode: 'SW17 8BU',
    city: 'London',
    category: 'Running',
    lat: 51.4258,
    lng: -0.1591,
    scheduleSummary: 'Mondays 19:00',
    memberCount: 0,
    verified: true,
    source: 'official',
    lastVerified: VERIFIED_LAST,
    sourceUrl: 'https://www.hernehillharriers.org/tooting-run-club-2/',
  },
  {
    groupId: 'grp_on_run_club_london',
    name: 'On Run Club London',
    description:
      'Sunday morning community runs from Regent Street, organised by On Running. Register via the official On Run Club page.',
    gymName: 'Regent Street',
    postcode: 'W1B 4JA',
    city: 'London',
    category: 'Running',
    lat: 51.5135,
    lng: -0.1402,
    scheduleSummary: 'Sundays 09:00',
    memberCount: 0,
    verified: true,
    source: 'official',
    lastVerified: VERIFIED_LAST,
    sourceUrl: 'https://onrunclub-londonregentst.events.on.com/',
  },
  {
    groupId: 'grp_goodgym_wandsworth',
    name: 'GoodGym Wandsworth',
    description:
      'Weekly group runs combined with volunteering and community projects across Wandsworth.',
    gymName: 'Wandsworth',
    postcode: 'SW18 2PU',
    city: 'London',
    category: 'Community Running',
    lat: 51.4571,
    lng: -0.1922,
    scheduleSummary: 'Weekly group runs',
    memberCount: 0,
    verified: true,
    source: 'official',
    lastVerified: VERIFIED_LAST,
    sourceUrl: 'https://www.goodgym.org/areas/wandsworth/group-runs',
  },
];

export function isTrainerSeedEnabled(): boolean {
  const raw = process.env.SEED_TRAINERS_ON_STARTUP;
  if (raw === undefined || raw === '') return true;
  return raw.toLowerCase() !== 'false' && raw !== '0';
}

export interface TrainerBootstrapResult {
  enabled: boolean;
  trainersSeeded: boolean;
  trainerCount: number;
  groupsSeeded: boolean;
  groupCount: number;
}

export async function getTrainerBootstrapStatus(): Promise<{
  trainerCount: number;
  groupCount: number;
  seedPresent: boolean;
}> {
  const db = getMongoClient().db(getMongoDbName());
  const trainerCount = await db.collection('trainer_profiles').countDocuments({ published: true });
  const groupCount = await db.collection('fitness_groups').countDocuments();
  const seedPresent =
    (await db.collection('trainer_profiles').countDocuments({ displayName: SEED_MARKER })) > 0;
  return { trainerCount, groupCount, seedPresent };
}

export async function ensureTrainerDataSeeded(): Promise<TrainerBootstrapResult> {
  if (!isTrainerSeedEnabled()) {
    console.log('[trainers] startup seed disabled (SEED_TRAINERS_ON_STARTUP=false)');
    const status = await getTrainerBootstrapStatus();
    return {
      enabled: false,
      trainersSeeded: false,
      trainerCount: status.trainerCount,
      groupsSeeded: false,
      groupCount: status.groupCount,
    };
  }

  await ensureTrainerProfileIndexes();
  await ensureFitnessGroupIndexes();

  const db = getMongoClient().db(getMongoDbName());
  const trainersCol = db.collection('trainer_profiles');
  const usersCol = db.collection('users');
  const groupsCol = db.collection('fitness_groups');

  let trainersSeeded = false;
  const existing = await trainersCol.countDocuments({ displayName: SEED_MARKER });
  if (existing > 0) {
    console.log('[trainers] seed data already present — skipping trainers');
  } else {
    const now = new Date().toISOString();
    for (const t of SEED_TRAINERS) {
      const userId = uuidv4();
      await usersCol.insertOne({
        userId,
        email: `seed-trainer-${userId.slice(0, 8)}@example.local`,
        name: t.displayName,
        roles: ['member', 'trainer'],
        authProvider: 'seed',
        createdAt: now,
        updatedAt: now,
      });

      await trainersCol.insertOne({
        trainerId: uuidv4(),
        userId,
        displayName: t.displayName,
        bio: t.bio,
        qualifications: t.qualifications,
        specialties: t.specialties,
        gymName: t.gymName,
        postcode: t.postcode,
        location: toGeoPoint(t.lat, t.lng),
        priceFrom: t.priceFrom,
        priceUnit: 'session',
        verified: true,
        featured: t.featured,
        published: true,
        stripeConnectOnboarded: false,
        ratingAvg: t.ratingAvg,
        reviewCount: t.reviewCount,
        createdAt: now,
        updatedAt: now,
      });
    }
    trainersSeeded = true;
    console.log(`[trainers] seeded ${SEED_TRAINERS.length} published trainer profiles`);
  }

  const removedLegacy = await groupsCol.deleteMany({
    $or: [
      { groupId: { $in: LEGACY_FICTIONAL_GROUP_IDS } },
      { name: { $in: LEGACY_FICTIONAL_GROUP_NAMES } },
    ],
  });
  if (removedLegacy.deletedCount > 0) {
    console.log(`[trainers] removed ${removedLegacy.deletedCount} legacy fictional fitness group(s)`);
  }

  let groupsSeeded = false;
  const now = new Date().toISOString();
  let groupsUpserted = 0;
  for (const g of SEED_GROUPS) {
    const doc = {
      groupId: g.groupId,
      name: g.name,
      description: g.description,
      gymName: g.gymName,
      postcode: g.postcode,
      city: g.city,
      category: g.category,
      location: toGeoPoint(g.lat, g.lng),
      scheduleSummary: g.scheduleSummary,
      memberCount: g.memberCount,
      verified: g.verified,
      source: g.source,
      lastVerified: g.lastVerified,
      sourceUrl: g.sourceUrl,
    };

    const exists = await groupsCol.countDocuments({ groupId: g.groupId });
    if (exists > 0) {
      await groupsCol.updateOne({ groupId: g.groupId }, { $set: doc });
    } else {
      await groupsCol.insertOne({ ...doc, createdAt: now });
    }
    groupsUpserted += 1;
  }
  if (groupsUpserted > 0) {
    groupsSeeded = true;
    console.log(`[trainers] upserted ${groupsUpserted} verified fitness group(s)`);
  }

  const status = await getTrainerBootstrapStatus();
  return {
    enabled: true,
    trainersSeeded,
    trainerCount: status.trainerCount,
    groupsSeeded,
    groupCount: status.groupCount,
  };
}
