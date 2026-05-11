/**
 * Public HTML page for Google Play (and similar) account-deletion URL requirements.
 * Configure on Render via environment variables.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDeleteAccountPlayStoreHtml(): string {
  const appName = escapeHtml(process.env.ACCOUNT_DELETION_APP_NAME || 'Agile Athletes');
  const developerName = escapeHtml(
    process.env.ACCOUNT_DELETION_DEVELOPER_NAME || 'OQ Agile Athletes'
  );
  const supportEmailRaw = process.env.ACCOUNT_DELETION_SUPPORT_EMAIL?.trim() || '';
  const supportEmail = supportEmailRaw ? escapeHtml(supportEmailRaw) : '';

  const contactBlock = supportEmail
    ? `<p>For questions about account deletion or your data, contact us at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>`
    : `<p>For questions about account deletion or your data, use the contact details shown on our app listing in the Play Store.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${appName} — Delete your account</title>
  <style>
    body { font-family: system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.1rem; margin-top: 1.5rem; }
    ol, ul { padding-left: 1.25rem; }
    li { margin: 0.35rem 0; }
    a { color: #0b57d0; }
  </style>
</head>
<body>
  <h1>${appName} — Delete your account</h1>
  <p><strong>Developer:</strong> ${developerName}</p>

  <h2>How to delete your account in the app</h2>
  <ol>
    <li>Open the ${appName} app.</li>
    <li>Go to <strong>Profile</strong>.</li>
    <li>Choose <strong>Delete account</strong> (or equivalent).</li>
    <li>Confirm when prompted. The app sends a secure request to our servers to remove your account.</li>
  </ol>

  <h2>What data is removed</h2>
  <p>When you complete in-app account deletion, we permanently delete your account and associated personal data stored for the app, including:</p>
  <ul>
    <li>Your profile (name and related profile fields)</li>
    <li>Exercise and workout history</li>
    <li>Step history</li>
    <li>Favorites and activity records</li>
    <li>Aggregated fitness stats tied to your account</li>
    <li>Profile photo (avatar) file, if you uploaded one</li>
  </ul>
  <p>Your sign-in session is tied to your account; after deletion, existing app tokens can no longer access an active account.</p>

  <h2>Data we may retain</h2>
  <p>We do not use this public page to create an account. If applicable law requires retaining certain minimal records (for example short-term server logs for security), those are described in our privacy policy and are not used to restore your deleted app profile.</p>

  <h2>Contact</h2>
  ${contactBlock}
</body>
</html>`;
}

export { buildDeleteAccountPlayStoreHtml };
