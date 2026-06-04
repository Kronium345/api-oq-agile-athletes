import { sendWelcomeEmail } from "./send-email.js";
/** Fire-and-forget welcome email so signup/register responses are not blocked. */
export function dispatchWelcomeEmail(to, userName) {
    void sendWelcomeEmail(to, userName).catch((err) => {
        console.error('[email] welcome failed:', err.message);
    });
}
