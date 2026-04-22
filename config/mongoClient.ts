import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGO_URI;
const mongoDbName = process.env.MONGO_DB_NAME || 'agile-athletes';

let client: MongoClient | null = null;

export async function connectToMongo(): Promise<void> {
  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  if (client) {
    return;
  }

  client = new MongoClient(mongoUri);
  await client.connect();
  console.log(`Connected to MongoDB database: ${mongoDbName}`);
}

export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error('MongoDB client not initialized. Call connectToMongo() first.');
  }

  return client;
}

export function getMongoDbName(): string {
  return mongoDbName;
}
