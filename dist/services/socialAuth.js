import { createSocialUser, getUserByAppleId, getUserByEmail, getUserById, updateUser, } from "../models/user.js";
import { dispatchWelcomeEmail } from "../utils/dispatchWelcomeEmail.js";
import { getDisplayName } from "../utils/userDisplay.js";
import { signAuthToken } from "../utils/jwt.js";
import { toClientUser } from "../utils/userResponse.js";
export function issueSessionToken(userId, email) {
    return signAuthToken(userId, email);
}
export function buildSocialAuthResponse(user, isNewUser) {
    const client = { ...toClientUser(user), isNewUser };
    const session = issueSessionToken(user.userId, user.email);
    return {
        success: true,
        user: client,
        result: client,
        token: session,
        session,
    };
}
export async function loginOrRegisterGoogle(profile) {
    let user = await getUserByEmail(profile.email);
    let isNewUser = false;
    if (user) {
        const updates = {};
        if (profile.picture && !user.avatar) {
            updates.avatar = profile.picture;
        }
        if (!user.firstName && profile.givenName)
            updates.firstName = profile.givenName;
        if (!user.lastName && profile.familyName)
            updates.lastName = profile.familyName;
        if (Object.keys(updates).length) {
            await updateUser(user.userId, updates);
            user = (await getUserById(user.userId));
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _, ...withoutPassword } = user;
        return { user: withoutPassword, isNewUser: false };
    }
    isNewUser = true;
    const firstName = profile.givenName || profile.name?.split(' ')[0] || 'User';
    const lastName = profile.familyName || profile.name?.split(' ').slice(1).join(' ') || '';
    const created = await createSocialUser({
        email: profile.email,
        firstName,
        lastName,
        name: profile.name || `${firstName} ${lastName}`.trim(),
        avatar: profile.picture || null,
        authProvider: 'google',
    });
    dispatchWelcomeEmail(created.email, getDisplayName(created));
    return { user: created, isNewUser };
}
export async function loginOrRegisterApple(profile) {
    let user = await getUserByAppleId(profile.sub);
    if (user) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _, ...withoutPassword } = user;
        return { user: withoutPassword, isNewUser: false };
    }
    if (profile.email) {
        const byEmail = await getUserByEmail(profile.email);
        if (byEmail) {
            await updateUser(byEmail.userId, { appleId: profile.sub, authProvider: 'apple' });
            const updated = await getUserById(byEmail.userId);
            return { user: updated, isNewUser: false };
        }
    }
    const email = profile.email || `apple_${profile.sub}@privaterelay.agile-athletes.local`;
    const created = await createSocialUser({
        email,
        firstName: 'Apple',
        lastName: 'User',
        name: 'Apple User',
        authProvider: 'apple',
        appleId: profile.sub,
    });
    dispatchWelcomeEmail(created.email, getDisplayName(created));
    return { user: created, isNewUser: true };
}
