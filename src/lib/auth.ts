import { SignJWT, jwtVerify } from 'jose';
import { JWTPayload } from '@/types/auth';

const SECRET_KEY = process.env.JWT_SECRET || 'default-secret-key-change-it-in-production';
const key = new TextEncoder().encode(SECRET_KEY);

export const signJWT = async (payload: Omit<JWTPayload, 'iat' | 'exp'>) => {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // 7 days expiration
    .sign(key);
};

export const verifyJWT = async (token: string): Promise<JWTPayload | null> => {
  try {
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as JWTPayload;
  } catch (error) {
    return null;
  }
};
