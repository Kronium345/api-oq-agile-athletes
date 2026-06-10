import express from 'express';
import { authenticate } from "../middleware/auth.js";
import { deleteAccountByUserId } from "../models/accountDeletion.js";
import bcrypt from 'bcryptjs';
import { authenticateUser, authenticateUserByEmailOrUsername, createUser, getUserByEmail, getUserByUsername, updateUser, } from "../models/user.js";
import { isEmailConfigured } from "../config/nodemailer.js";
import { sendPasswordResetEmail } from "../utils/send-email.js";
import { dispatchWelcomeEmail } from "../utils/dispatchWelcomeEmail.js";
import { signAuthToken } from "../utils/jwt.js";
import { toClientUser } from "../utils/userResponse.js";
import { getDisplayName } from "../utils/userDisplay.js";
import { verifyGoogleIdToken } from "../services/googleAuth.js";
import { verifyAppleIdentityToken } from "../services/appleAuth.js";
import { buildSocialAuthResponse, loginOrRegisterApple, loginOrRegisterGoogle, } from "../services/socialAuth.js";
const router = express.Router();
function issueToken(userId, email) {
    return signAuthToken(userId, email);
}
/** Legacy + app-compatible user payload */
function authPayload(user) {
    const client = toClientUser(user);
    return {
        success: true,
        token: issueToken(user.userId, user.email),
        user: client,
        result: client,
    };
}
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, username } = req.body;
        if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
            return res.status(400).json({ message: 'firstName, lastName, email, and password are required' });
        }
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ message: 'An account with this email already exists' });
        }
        if (username?.trim()) {
            const existingUsername = await getUserByUsername(username);
            if (existingUsername) {
                return res.status(409).json({ message: 'Username already taken' });
            }
        }
        const user = await createUser({
            name: `${firstName.trim()} ${lastName.trim()}`,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            password,
            username: username?.trim(),
        });
        dispatchWelcomeEmail(user.email, getDisplayName(user));
        const client = toClientUser(user);
        return res.status(201).json({
            result: client,
            token: issueToken(user.userId, user.email),
        });
    }
    catch (error) {
        const err = error;
        console.error('Register error:', err);
        return res.status(500).json({ message: 'Something went wrong on the server.', error: err.message });
    }
});
router.post('/login', async (req, res) => {
    try {
        const { emailOrUsername, password } = req.body;
        if (!emailOrUsername?.trim() || !password) {
            return res.status(400).json({ message: 'emailOrUsername and password are required' });
        }
        const authResult = await authenticateUserByEmailOrUsername(emailOrUsername, password);
        if (!authResult.success || !authResult.user) {
            if (authResult.message === 'User not found') {
                return res.status(404).json({ message: 'User not found' });
            }
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const client = toClientUser(authResult.user);
        return res.status(200).json({
            result: client,
            token: issueToken(authResult.user.userId, authResult.user.email),
        });
    }
    catch (error) {
        const err = error;
        console.error('Login error:', err);
        return res.status(500).json({ message: 'Something went wrong on the server.', error: err.message });
    }
});
// --- Legacy routes (existing OQ clients) ---
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'name, email, and password are required',
            });
        }
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email already in use',
            });
        }
        const user = await createUser({ name, email, password });
        dispatchWelcomeEmail(user.email, getDisplayName(user));
        const payload = authPayload(user);
        return res.status(201).json({
            success: true,
            message: 'User created successfully',
            token: payload.token,
            user: payload.user,
        });
    }
    catch (error) {
        const err = error;
        console.error('Sign up error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to sign up',
            error: err.message,
        });
    }
});
router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'email and password are required',
            });
        }
        const authResult = await authenticateUser(email, password);
        if (!authResult.success || !authResult.user) {
            return res.status(401).json({
                success: false,
                message: authResult.message || 'Invalid credentials',
            });
        }
        const client = toClientUser(authResult.user);
        return res.json({
            success: true,
            message: 'Sign in successful',
            token: issueToken(authResult.user.userId, authResult.user.email),
            user: client,
        });
    }
    catch (error) {
        const err = error;
        console.error('Sign in error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to sign in',
            error: err.message,
        });
    }
});
// --- Google & Apple Sign-In (native OAuth → server-verified tokens) ---
router.post('/google', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token?.trim()) {
            return res.status(400).json({ success: false, message: 'No token provided' });
        }
        const profile = await verifyGoogleIdToken(token);
        const { user, isNewUser } = await loginOrRegisterGoogle(profile);
        const payload = buildSocialAuthResponse(user, isNewUser);
        return res.status(isNewUser ? 201 : 200).json(payload);
    }
    catch (error) {
        const err = error;
        console.error('Google auth error:', err.message);
        return res.status(401).json({
            success: false,
            message: 'Google authentication failed',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined,
        });
    }
});
router.post('/apple', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token?.trim()) {
            return res.status(400).json({ success: false, message: 'No token provided' });
        }
        const profile = await verifyAppleIdentityToken(token);
        const { user, isNewUser } = await loginOrRegisterApple(profile);
        const payload = buildSocialAuthResponse(user, isNewUser);
        return res.status(isNewUser ? 201 : 200).json(payload);
    }
    catch (error) {
        const err = error;
        console.error('Apple auth error:', err.message);
        return res.status(401).json({
            success: false,
            message: 'Apple authentication failed',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined,
        });
    }
});
router.get('/current-user', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const client = toClientUser(user);
        res.json({
            success: true,
            user: client,
        });
    }
    catch (error) {
        const err = error;
        console.error('Get current user error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to get user',
            error: err.message,
        });
    }
});
router.post('/forgotpassword', async (req, res) => {
    const { email } = req.body;
    if (!email?.trim()) {
        return res.status(400).json({ message: 'Email is required' });
    }
    if (!isEmailConfigured()) {
        return res.status(500).json({ message: 'Email service not configured' });
    }
    try {
        const user = await getUserByEmail(email.trim());
        if (!user) {
            return res.status(404).json({ message: 'No account found with this email' });
        }
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await updateUser(user.userId, { resetCode, resetCodeExpires });
        await sendPasswordResetEmail(user.email, resetCode);
        const exposeCode = process.env.NODE_ENV !== 'production' || process.env.EMAIL_EXPOSE_RESET_CODE === 'true';
        return res.status(200).json({
            message: 'Reset code has been sent to your email',
            ...(exposeCode ? { resetCode } : {}),
        });
    }
    catch (error) {
        const err = error;
        console.error('Forgot password error:', err);
        return res.status(500).json({ message: 'Failed to send reset code email' });
    }
});
router.post('/resetpassword', async (req, res) => {
    const { email, resetCode, newPassword } = req.body;
    if (!email?.trim() || !resetCode?.trim() || !newPassword) {
        return res.status(400).json({ message: 'email, resetCode, and newPassword are required' });
    }
    try {
        const user = await getUserByEmail(email.trim());
        if (!user ||
            user.resetCode !== resetCode.trim() ||
            !user.resetCodeExpires ||
            new Date(user.resetCodeExpires).getTime() < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired reset code' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await updateUser(user.userId, {
            password: hashedPassword,
            resetCode: null,
            resetCodeExpires: null,
        });
        return res.status(200).json({ message: 'Password updated successfully' });
    }
    catch (error) {
        const err = error;
        console.error('Reset password error:', err);
        return res.status(500).json({ message: 'Error resetting password' });
    }
});
router.delete('/delete', authenticate, async (req, res) => {
    try {
        const userId = req.userId;
        await deleteAccountByUserId(userId);
        return res.status(204).send();
    }
    catch (error) {
        const err = error;
        console.error('Delete account error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete account',
        });
    }
});
export default router;
