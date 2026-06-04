import { sendWelcomeEmail } from './send-email.ts';

/** Fire-and-forget welcome email so signup/register responses are not blocked. */
export function dispatchWelcomeEmail(to: string, userName: string): void {
  void sendWelcomeEmail(to, userName).catch((err: Error) => {
    console.error('[email] welcome failed:', err.message);
  });
}
