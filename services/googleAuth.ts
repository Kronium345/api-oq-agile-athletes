import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  email: string;
  sub: string;
  givenName?: string;
  familyName?: string;
  name?: string;
  picture?: string;
}

let googleClient: OAuth2Client | null = null;

function getGoogleClient(): OAuth2Client {
  if (!googleClient) {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || process.env.WEB_CLIENT_ID?.trim();
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID or WEB_CLIENT_ID is not configured');
    }
    googleClient = new OAuth2Client(clientId);
  }
  return googleClient;
}

function getWebClientId(): string {
  const id = process.env.WEB_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  if (!id) {
    throw new Error('WEB_CLIENT_ID is not configured');
  }
  return id;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!idToken?.trim()) {
    throw new Error('No token provided');
  }

  const ticket = await getGoogleClient().verifyIdToken({
    idToken: idToken.trim(),
    audience: getWebClientId(),
  });

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new Error('Google token missing email');
  }

  return {
    email: payload.email.toLowerCase().trim(),
    sub: payload.sub || '',
    givenName: payload.given_name,
    familyName: payload.family_name,
    name: payload.name,
    picture: payload.picture,
  };
}
