import { MongoClient } from 'mongodb';

let client: MongoClient | null = null;

function getUriDiagnostics(uri: string): {
  scheme: string;
  host: string;
  hasDbPath: boolean;
  queryKeys: string[];
  passwordHasSpecialChars: boolean;
} {
  const scheme = uri.startsWith('mongodb+srv://')
    ? 'mongodb+srv'
    : uri.startsWith('mongodb://')
      ? 'mongodb'
      : 'unknown';

  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const atIndex = withoutScheme.indexOf('@');
  const credentialsPart = atIndex >= 0 ? withoutScheme.slice(0, atIndex) : '';
  const hostAndRest = atIndex >= 0 ? withoutScheme.slice(atIndex + 1) : withoutScheme;
  const slashIndex = hostAndRest.indexOf('/');
  const host = slashIndex >= 0 ? hostAndRest.slice(0, slashIndex) : hostAndRest;
  const rest = slashIndex >= 0 ? hostAndRest.slice(slashIndex + 1) : '';
  const queryIndex = rest.indexOf('?');
  const dbPath = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
  const query = queryIndex >= 0 ? rest.slice(queryIndex + 1) : '';

  const queryKeys = query
    .split('&')
    .map((pair) => pair.split('=')[0])
    .filter(Boolean);

  let passwordHasSpecialChars = false;
  if (credentialsPart.includes(':')) {
    const password = credentialsPart.split(':').slice(1).join(':');
    // Characters that must be URL-encoded in MongoDB credentials.
    passwordHasSpecialChars = /[@:/?#\[\]]/.test(password);
  }

  return {
    scheme,
    host,
    hasDbPath: Boolean(dbPath),
    queryKeys,
    passwordHasSpecialChars,
  };
}

function getErrorDiagnostics(error: unknown): Record<string, unknown> {
  const err = error as {
    name?: string;
    message?: string;
    code?: string | number;
    codeName?: string;
    cause?: unknown;
    stack?: string;
    reason?: unknown;
  };

  return {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    codeName: err?.codeName,
    causeName: (err?.cause as { name?: string } | undefined)?.name,
    causeMessage: (err?.cause as { message?: string } | undefined)?.message,
    reason: err?.reason,
    stackTop: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 3).join('\n') : undefined,
  };
}

export async function connectToMongo(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  const mongoDbName = process.env.MONGO_DB_NAME || 'agile-athletes';

  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  if (client) {
    return;
  }

  try {
    const uriDiagnostics = getUriDiagnostics(mongoUri);
    console.log('MongoDB connection diagnostics:', {
      nodeEnv: process.env.NODE_ENV || 'development',
      hasMongoUri: Boolean(mongoUri),
      scheme: uriDiagnostics.scheme,
      host: uriDiagnostics.host,
      hasDbPath: uriDiagnostics.hasDbPath,
      queryKeys: uriDiagnostics.queryKeys,
      passwordHasSpecialChars: uriDiagnostics.passwordHasSpecialChars,
      dbNameEnv: mongoDbName,
    });

    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    await client.connect();
    console.log(`Connected to MongoDB database: ${mongoDbName}`);
  } catch (error: any) {
    const message = String(error?.message || '');
    console.error('MongoDB connection failure diagnostics:', getErrorDiagnostics(error));

    if (message.includes('authentication failed') || message.includes('bad auth')) {
      throw new Error('MongoDB authentication failed. Verify username/password in MONGO_URI and URL-encode special characters in the password.');
    }

    if (message.includes('querySrv ECONNREFUSED') || message.includes('querySrv ENOTFOUND')) {
      throw new Error('MongoDB SRV lookup failed. Check network/DNS access or use a non-SRV mongodb:// connection string from Atlas.');
    }

    if (message.toLowerCase().includes('tls') || message.toLowerCase().includes('ssl')) {
      throw new Error('MongoDB TLS/SSL handshake failed. Confirm Atlas allows 0.0.0.0/0, verify hostname in MONGO_URI, and ensure any special characters in password are URL-encoded.');
    }

    throw error;
  }
}

export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error('MongoDB client not initialized. Call connectToMongo() first.');
  }

  return client;
}

export function getMongoDbName(): string {
  return process.env.MONGO_DB_NAME || 'agile-athletes';
}
