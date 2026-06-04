import jwt from 'jsonwebtoken';
export function signAuthToken(userId, email) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return userId;
    }
    const expiresIn = (process.env.JWT_EXPIRES_IN || '7d');
    return jwt.sign({ id: userId, userId, email }, secret, { expiresIn });
}
export function verifyAuthToken(token) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return null;
    }
    try {
        const decoded = jwt.verify(token, secret);
        const userId = decoded.id || decoded.userId;
        if (!userId || typeof userId !== 'string') {
            return null;
        }
        return { userId, email: decoded.email };
    }
    catch {
        return null;
    }
}
