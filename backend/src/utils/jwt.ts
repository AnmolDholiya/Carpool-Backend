import jwt from 'jsonwebtoken';
import { getConfig } from '../config/config';

const { jwtSecret } = getConfig();

export type JwtPayload = {
  userId: number;
  role: 'USER' | 'ADMIN';
};

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, jwtSecret) as JwtPayload;
}


