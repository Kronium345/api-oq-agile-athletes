import jwt, { type SignOptions } from 'jsonwebtoken';

export function signAuthToken(userId: string, email: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return userId;
  }

  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
  return jwt.sign({ id: userId, userId, email }, secret, { expiresIn });
}

export function verifyAuthToken(token: string): { userId: string; email?: string } | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, secret) as {
      id?: string;
      userId?: string;
      email?: string;
    };
    const userId = decoded.id || decoded.userId;
    if (!userId || typeof userId !== 'string') {
      return null;
    }
    return { userId, email: decoded.email };
  } catch {
    return null;
  }
}
