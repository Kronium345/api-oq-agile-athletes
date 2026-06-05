/**
 * Manual PT seed (same logic as server startup).
 * Run: npm run seed:trainers
 */
import 'dotenv/config';
import { connectToMongo } from '../config/mongoClient.ts';
import { ensureTrainerDataSeeded } from '../services/trainerBootstrap.ts';

async function main() {
  await connectToMongo();
  const result = await ensureTrainerDataSeeded();
  console.log('[seed] Done', result);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
