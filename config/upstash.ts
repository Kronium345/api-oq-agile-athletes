import { Client as WorkflowClient } from '@upstash/workflow';

const qstashUrl = process.env.QSTASH_URL || 'https://qstash-eu-central-1.upstash.io';
const qstashToken = process.env.QSTASH_TOKEN || '';

/**
 * Programmatic QStash publishes (optional).
 * Workflow HTTP handlers use @upstash/workflow `serve()` and read from process.env:
 * QSTASH_URL, QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY
 */
export const workflowClient = new WorkflowClient({
  baseUrl: qstashUrl,
  token: qstashToken,
});

export { qstashUrl, qstashToken };
