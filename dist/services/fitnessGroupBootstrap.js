import { getMongoClient, getMongoDbName } from "../config/mongoClient.js";
import { ensureFitnessGroupIndexes } from "../models/fitnessGroup.js";
import { toGeoPoint } from "../utils/geocode.js";
/** Verified London run clubs — sourced from official club pages (see sourceUrl). */
const VERIFIED_LAST = '2026-06';
const LEGACY_FICTIONAL_GROUP_IDS = ['grp_1', 'grp_2', 'grp_3'];
const LEGACY_FICTIONAL_GROUP_NAMES = [
    'Aldgate Morning Run Club',
    'East London Run Club',
    'City HIIT Crew',
];
export const SEED_FITNESS_GROUPS = [
    {
        groupId: 'grp_gymshark_run_london',
        name: 'Gymshark Run Club London',
        description: 'Weekly community 5K from Gymshark Regent Street. Open to all paces — check Gymshark for the latest session details.',
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
        description: 'Friendly local club with Thursday evening runs and Sunday social sessions around Wandsworth Park.',
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
        description: 'Monday evening sessions at Tooting Bec Athletics Track. Affiliated with Herne Hill Harriers.',
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
        description: 'Sunday morning community runs from Regent Street, organised by On Running. Register via the official On Run Club page.',
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
        description: 'Weekly group runs combined with volunteering and community projects across Wandsworth.',
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
export async function ensureFitnessGroupsSeeded() {
    await ensureFitnessGroupIndexes();
    const groupsCol = getMongoClient().db(getMongoDbName()).collection('fitness_groups');
    const removedLegacy = await groupsCol.deleteMany({
        $or: [
            { groupId: { $in: LEGACY_FICTIONAL_GROUP_IDS } },
            { name: { $in: LEGACY_FICTIONAL_GROUP_NAMES } },
        ],
    });
    if (removedLegacy.deletedCount > 0) {
        console.log(`[groups] removed ${removedLegacy.deletedCount} legacy fictional fitness group(s)`);
    }
    const now = new Date().toISOString();
    let upserted = 0;
    for (const g of SEED_FITNESS_GROUPS) {
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
        }
        else {
            await groupsCol.insertOne({ ...doc, createdAt: now });
        }
        upserted += 1;
    }
    if (upserted > 0) {
        console.log(`[groups] upserted ${upserted} verified fitness group(s)`);
    }
    const groupCount = await groupsCol.countDocuments();
    return {
        legacyRemoved: removedLegacy.deletedCount,
        upserted,
        groupCount,
    };
}
