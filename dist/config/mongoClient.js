import { MongoClient } from 'mongodb';
let client = null;
export async function connectToMongo() {
    const mongoUri = process.env.MONGO_URI;
    const mongoDbName = process.env.MONGO_DB_NAME || 'agile-athletes';
    if (!mongoUri) {
        throw new Error('MONGO_URI is required');
    }
    if (mongoUri.includes('<db_password>')) {
        throw new Error('MONGO_URI still contains <db_password>. Replace it with your real MongoDB user password (URL-encoded).');
    }
    if (client) {
        return;
    }
    try {
        client = new MongoClient(mongoUri);
        await client.connect();
        console.log(`Connected to MongoDB database: ${mongoDbName}`);
    }
    catch (error) {
        const message = String(error?.message || '');
        if (message.includes('authentication failed') || message.includes('bad auth')) {
            throw new Error('MongoDB authentication failed. Verify username/password in MONGO_URI and URL-encode special characters in the password.');
        }
        if (message.includes('querySrv ECONNREFUSED') || message.includes('querySrv ENOTFOUND')) {
            throw new Error('MongoDB SRV lookup failed. Check network/DNS access or use a non-SRV mongodb:// connection string from Atlas.');
        }
        throw error;
    }
}
export function getMongoClient() {
    if (!client) {
        throw new Error('MongoDB client not initialized. Call connectToMongo() first.');
    }
    return client;
}
export function getMongoDbName() {
    return process.env.MONGO_DB_NAME || 'agile-athletes';
}
