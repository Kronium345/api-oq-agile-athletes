import { v4 as uuidv4 } from 'uuid';
import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
import { ensureFitnessGroupIndexes } from "../models/fitnessGroup.js";
import { ensureTrainerProfileIndexes } from "../models/trainerProfile.js";
import { ensureFitnessGroupsSeeded } from "./fitnessGroupBootstrap.js";
import { toGeoPoint } from "../utils/geocode.js";
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
export function isTrainerSeedEnabled() {
    const raw = process.env.SEED_TRAINERS_ON_STARTUP;
    if (raw === undefined || raw === '')
        return true;
    return raw.toLowerCase() !== 'false' && raw !== '0';
}
export async function getTrainerBootstrapStatus() {
    const db = getMongoClient().db(getMongoDbName());
    const trainerCount = await db.collection('trainer_profiles').countDocuments({ published: true });
    const groupCount = await db.collection('fitness_groups').countDocuments();
    const seedPresent = (await db.collection('trainer_profiles').countDocuments({ displayName: SEED_MARKER })) > 0;
    return { trainerCount, groupCount, seedPresent };
}
export async function ensureTrainerDataSeeded() {
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
    let trainersSeeded = false;
    const existing = await trainersCol.countDocuments({ displayName: SEED_MARKER });
    if (existing > 0) {
        console.log('[trainers] seed data already present — skipping trainers');
    }
    else {
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
    const groupSeed = await ensureFitnessGroupsSeeded();
    const status = await getTrainerBootstrapStatus();
    return {
        enabled: true,
        trainersSeeded,
        trainerCount: status.trainerCount,
        groupsSeeded: groupSeed.upserted > 0,
        groupCount: groupSeed.groupCount,
    };
}
