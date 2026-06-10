import transporter, { accountEmail, isEmailConfigured } from "../config/nodemailer.js";
import { shouldSendConnectionRequestEmail } from "./emailNotifications.js";
import { buildEmailBannerRow, welcomeAppDisplayName, welcomeEmailLogoUrl } from "./send-email.js";
import { getDisplayName } from "./userDisplay.js";
function frontendBase() {
    let url = (process.env.FRONTEND_URL || 'https://agile-athletes.expo.app').trim().replace(/\/$/, '');
    if (url && !/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }
    return url;
}
function deepLinkScheme() {
    return (process.env.APP_DEEP_LINK_SCHEME || 'oqagileathletes').trim().replace(/:\/\//, '');
}
export function connectionsWebLink(requestId) {
    const base = `${frontendBase()}/connections`;
    if (!requestId)
        return base;
    return `${base}?requestId=${encodeURIComponent(requestId)}`;
}
export function connectionsDeepLink(requestId) {
    const scheme = deepLinkScheme();
    if (!requestId)
        return `${scheme}://connections`;
    return `${scheme}://connections?requestId=${encodeURIComponent(requestId)}`;
}
function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function buildConnectionEmailHtml(params) {
    const appName = welcomeAppDisplayName();
    const c = { primary: '#FF6F00', primaryDark: '#E65100', muted: '#555555', pageBg: '#FFF8F0' };
    const logoUrl = welcomeEmailLogoUrl();
    const logoRow = logoUrl ? buildEmailBannerRow(logoUrl, c.pageBg, appName) : '';
    return `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; line-height: 1.55; color: #333; max-width: 600px; margin: 0 auto; background-color: ${c.pageBg};">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 15px; overflow: hidden; box-shadow: 0 6px 12px rgba(230, 81, 0, 0.12);">
        ${logoRow}
        <tr>
          <td style="background: linear-gradient(135deg, ${c.primary} 0%, ${c.primaryDark} 100%); text-align: center; padding: 26px;">
            <h1 style="color: white; font-size: 24px; margin: 0;">${escapeHtml(appName)}</h1>
            <p style="color: rgba(255,255,255,0.92); font-size: 15px; margin: 10px 0 0;">${escapeHtml(params.headline)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px;">
            <p style="font-size: 16px; margin: 0 0 16px;">Hi <strong style="color: ${c.primaryDark};">${escapeHtml(params.recipientName)}</strong>,</p>
            <div style="font-size: 15px; color: ${c.muted}; margin-bottom: 24px;">${params.bodyHtml}</div>
            <p style="text-align: center; margin: 0 0 16px;">
              <a href="${escapeHtml(params.ctaLink)}" style="background: linear-gradient(135deg, ${c.primary} 0%, ${c.primaryDark} 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 25px; font-weight: 600; display: inline-block;">${escapeHtml(params.ctaText)}</a>
            </p>
            ${params.secondaryLink
        ? `<p style="text-align: center; font-size: 13px; margin: 0;"><a href="${escapeHtml(params.secondaryLink)}" style="color: ${c.primaryDark};">${escapeHtml(params.secondaryLabel || 'Open in app')}</a></p>`
        : ''}
          </td>
        </tr>
      </table>
    </div>`;
}
function senderProfileLines(sender) {
    const parts = [];
    if (typeof sender.gymName === 'string' && sender.gymName.trim()) {
        parts.push(`<strong>Gym:</strong> ${escapeHtml(sender.gymName.trim())}`);
    }
    if (typeof sender.experience === 'string' && sender.experience.trim()) {
        parts.push(`<strong>Experience:</strong> ${escapeHtml(sender.experience.trim())}`);
    }
    const goal = typeof sender.goal === 'string'
        ? sender.goal
        : typeof sender.fitnessGoal === 'string'
            ? sender.fitnessGoal
            : null;
    if (goal?.trim()) {
        parts.push(`<strong>Goal:</strong> ${escapeHtml(goal.trim())}`);
    }
    if (!parts.length)
        return '';
    return `<p style="margin: 16px 0 0;">${parts.join('<br/>')}</p>`;
}
export async function sendPartnerConnectRequestEmail(recipient, sender, requestId) {
    if (!recipient.email?.trim())
        return { success: false, skipped: true };
    if (!shouldSendConnectionRequestEmail(recipient)) {
        console.log(`[email] skipped partner request — connectionRequests off for ${recipient.userId}`);
        return { success: false, skipped: true };
    }
    if (!isEmailConfigured()) {
        console.warn('[email] skipped partner request — email not configured');
        return { success: false, skipped: true };
    }
    const senderName = getDisplayName(sender);
    const recipientName = getDisplayName(recipient);
    const appName = welcomeAppDisplayName();
    const webLink = connectionsWebLink(requestId);
    const deepLink = connectionsDeepLink(requestId);
    const html = buildConnectionEmailHtml({
        recipientName,
        headline: 'New training partner request',
        bodyHtml: `
      <p style="margin: 0;"><strong>${escapeHtml(senderName)}</strong> wants to train with you on ${escapeHtml(appName)}.</p>
      ${senderProfileLines(sender)}
      <p style="margin: 16px 0 0;">Open Connections to accept or decline.</p>`,
        ctaText: 'View request',
        ctaLink: webLink,
        secondaryLink: deepLink,
        secondaryLabel: 'Open in app',
    });
    await transporter.sendMail({
        from: process.env.EMAIL_FROM || accountEmail,
        to: recipient.email.trim(),
        subject: `${senderName} wants to train with you on ${appName}`,
        html,
    });
    console.log(`[email] sent partner connect request → ${recipient.email}`);
    return { success: true };
}
export async function sendPartnerConnectAcceptedEmail(originalSender, accepter) {
    if (!originalSender.email?.trim())
        return { success: false, skipped: true };
    if (!shouldSendConnectionRequestEmail(originalSender)) {
        return { success: false, skipped: true };
    }
    if (!isEmailConfigured()) {
        return { success: false, skipped: true };
    }
    const accepterName = getDisplayName(accepter);
    const senderName = getDisplayName(originalSender);
    const appName = welcomeAppDisplayName();
    const webLink = connectionsWebLink();
    const html = buildConnectionEmailHtml({
        recipientName: senderName,
        headline: 'Partner request accepted',
        bodyHtml: `<p style="margin: 0;"><strong>${escapeHtml(accepterName)}</strong> accepted your training partner request. You're now connected on ${escapeHtml(appName)}!</p>`,
        ctaText: 'View connections',
        ctaLink: webLink,
        secondaryLink: connectionsDeepLink(),
        secondaryLabel: 'Open in app',
    });
    await transporter.sendMail({
        from: process.env.EMAIL_FROM || accountEmail,
        to: originalSender.email.trim(),
        subject: `${accepterName} accepted your partner request on ${appName}`,
        html,
    });
    console.log(`[email] sent partner connect accepted → ${originalSender.email}`);
    return { success: true };
}
