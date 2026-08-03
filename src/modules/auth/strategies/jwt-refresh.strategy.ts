import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtRefreshPayload } from '../interfaces/jwt-payload.interface';
import { JWT_STRATEGY } from '../../../common/constants/app.constants';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  JWT_STRATEGY.REFRESH,
) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Try Authorization header first
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Fall back to cookie
        (req: Request) => req?.cookies?.refresh_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtRefreshPayload): JwtRefreshPayload {
    // Extract raw token for validation in service
    const authHeader = req.headers.authorization;
    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.cookies?.refresh_token;

    if (!rawToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    return { ...payload, refreshTokenId: payload.refreshTokenId };
  }
}
