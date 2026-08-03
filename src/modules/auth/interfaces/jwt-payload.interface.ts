import { UserRole } from '@prisma/client';

/**
 * Payload embedded in JWT access tokens
 */
export interface JwtPayload {
  sub: string;       // userId
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Payload for refresh token JWT
 */
export interface JwtRefreshPayload extends JwtPayload {
  refreshTokenId: string;
}
