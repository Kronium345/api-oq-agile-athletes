import { createRemoteJWKSet, jwtVerify } from 'jose';
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));
function getAppleClientId() {
    const id = process.env.APPLE_CLIENT_ID?.trim();
    if (!id) {
        throw new Error('APPLE_CLIENT_ID is not configured');
    }
    return id;
}
export async function verifyAppleIdentityToken(identityToken) {
    if (!identityToken?.trim()) {
        throw new Error('No token provided');
    }
    const { payload } = await jwtVerify(identityToken.trim(), APPLE_JWKS, {
        issuer: APPLE_ISSUER,
        audience: getAppleClientId(),
    });
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) {
        throw new Error('Apple token missing subject');
    }
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : undefined;
    return { email, sub };
}
