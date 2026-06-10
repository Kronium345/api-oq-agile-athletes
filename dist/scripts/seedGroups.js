/**
 * Upsert verified London run clubs only (no trainer profiles).
 * Run: npm run seed:groups
 *
 * Uses MONGO_URI from .env — point at production before running against live data.
 */
import 'dotenv/config';
import { connectToMongo } from "../config/mongoClient.js";
import { ensureFitnessGroupsSeeded } from "../services/fitnessGroupBootstrap.js";
async function main() {
    await connectToMongo();
    const result = await ensureFitnessGroupsSeeded();
    console.log('[seed:groups] Done', result);
    process.exit(0);
}
main().catch((err) => {
    console.error('[seed:groups] Failed:', err);
    process.exit(1);
});
