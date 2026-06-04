/** Upstash QStash + Workflow env (see Upstash Console → QStash). */

export function getQstashConfig() {
  return {
    url: process.env.QSTASH_URL || 'https://qstash-eu-central-1.upstash.io',
    hasToken: Boolean(process.env.QSTASH_TOKEN?.trim()),
    hasSigningKeys: Boolean(
      process.env.QSTASH_CURRENT_SIGNING_KEY?.trim() &&
        process.env.QSTASH_NEXT_SIGNING_KEY?.trim()
    ),
  };
}

export function logQstashStartup(): void {
  const { url, hasToken, hasSigningKeys } = getQstashConfig();
  console.log('[qstash] config', {
    url,
    hasToken,
    hasSigningKeys,
    workflowVerify: hasSigningKeys
      ? 'Upstash-Signature (SDK)'
      : 'disabled — set signing keys in production',
  });
  if (!hasSigningKeys) {
    console.warn(
      '[qstash] QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY not set — workflow POSTs are not signature-verified'
    );
  }
}
