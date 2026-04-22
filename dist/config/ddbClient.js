import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN;
const hasAccessKey = Boolean(accessKeyId);
const hasSecretKey = Boolean(secretAccessKey);
if (hasAccessKey !== hasSecretKey) {
    throw new Error('Invalid AWS credential configuration: both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together.');
}
const clientConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
};
if (hasAccessKey && hasSecretKey) {
    clientConfig.credentials = {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
    };
}
const client = new DynamoDBClient(clientConfig);
const ddbDocClient = DynamoDBDocumentClient.from(client);
export { client, ddbDocClient };
