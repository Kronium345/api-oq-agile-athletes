/**
 * Seed 3–5 published trainer profiles in London for frontend QA.
 * Run: node --import tsx scripts/seedTrainers.ts
 */
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import { connectToMongo, getMongoClient, getMongoDbName } from "../config/mongoClient.js";
import { ensureTrainerProfileIndexes } from "../models/trainerProfile.js";
import { ensureFitnessGroupIndexes } from "../models/fitnessGroup.js";
import { toGeoPoint } from "../utils/geocode.js";
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
const SEED_GROUPS = [
    {
        name: 'East London Run Club',
        description: 'Weekly 5K and 10K group runs around Shoreditch and the Olympic Park.',
        gymName: 'Victoria Park',
        postcode: 'E9 7DD',
        lat: 51.5313,
        lng: -0.039,
        scheduleSummary: 'Tue & Thu 6:30pm',
        memberCount: 42,
    },
    {
        name: 'City HIIT Crew',
        description: 'High-intensity group sessions for all levels in the Square Mile.',
        gymName: 'Moorgate',
        postcode: 'EC2Y 9AE',
        lat: 51.5186,
        lng: -0.0886,
        scheduleSummary: 'Mon/Wed/Fri 7am',
        memberCount: 28,
    },
];
async function seed() {
    await connectToMongo();
    await ensureTrainerProfileIndexes();
    await ensureFitnessGroupIndexes();
    const db = getMongoClient().db(getMongoDbName());
    const trainersCol = db.collection('trainer_profiles');
    const usersCol = db.collection('users');
    const groupsCol = db.collection('fitness_groups');
    const existing = await trainersCol.countDocuments({ displayName: SEED_TRAINERS[0].displayName });
    if (existing > 0) {
        console.log('[seed] Trainer profiles already exist — skipping');
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
        console.log(`[seed] Inserted ${SEED_TRAINERS.length} trainer profiles`);
    }
    const groupExists = await groupsCol.countDocuments({ name: SEED_GROUPS[0].name });
    if (groupExists === 0) {
        const now = new Date().toISOString();
        for (const g of SEED_GROUPS) {
            await groupsCol.insertOne({
                groupId: uuidv4(),
                name: g.name,
                description: g.description,
                gymName: g.gymName,
                postcode: g.postcode,
                location: toGeoPoint(g.lat, g.lng),
                scheduleSummary: g.scheduleSummary,
                memberCount: g.memberCount,
                createdAt: now,
            });
        }
        console.log(`[seed] Inserted ${SEED_GROUPS.length} fitness groups`);
    }
    console.log('[seed] Done');
    process.exit(0);
}
seed().catch((err) => {
    console.error('[seed] Failed:', err);
    process.exit(1);
});
