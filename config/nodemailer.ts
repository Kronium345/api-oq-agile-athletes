import nodemailer from 'nodemailer';

export const accountEmail = process.env.EMAIL_USER || process.env.EMAIL_FROM || '';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: accountEmail,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

export function isEmailConfigured(): boolean {
  return Boolean(accountEmail && process.env.EMAIL_APP_PASSWORD);
}

export function verifyEmailTransport(): void {
  if (!isEmailConfigured()) {
    console.warn('[email] EMAIL_USER and EMAIL_APP_PASSWORD not set — transactional email disabled');
    return;
  }
  transporter.verify((error) => {
    if (error) {
      console.error('[email] transporter verification failed:', error.message);
    } else {
      console.log('[email] transporter ready');
    }
  });
}

export default transporter;
