import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export interface JitsiTokenPayload {
  context: {
    user: {
      id: string;
      name: string;
      email: string;
      avatar?: string;
    };
    group: string;
  };
  aud: string;
  iss: string;
  sub: string;
  room: string;
  exp: number;
}

@Injectable()
export class JitsiJwtGenerator {
  private readonly logger = new Logger(JitsiJwtGenerator.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Generates a Jitsi-compliant JWT for secure room access control.
   */
  generateToken(
    userId: string,
    fullName: string,
    email: string,
    roomName: string,
    isModerator: boolean = false,
  ): string {
    const appId = this.config.get<string>('jitsi.appId') || 'monpsy';
    const appSecret = this.config.get<string>('jitsi.appSecret') || 'jitsiappsecret1234567890jitsiappsecret';
    const expirySecs = this.config.get<number>('jitsi.tokenExpiry') || 7200;
    const domain = this.config.get<string>('jitsi.domain') || 'meet.monpsy.tn';

    const payload: JitsiTokenPayload = {
      context: {
        user: {
          id: userId,
          name: fullName,
          email: email,
        },
        group: 'monpsy-consultations',
      },
      aud: appId,
      iss: appId,
      sub: domain,
      room: roomName,
      exp: Math.floor(Date.now() / 1000) + expirySecs,
    };

    // Set roles: Jitsi supports affiliations in token context
if (isModerator) {
      (payload.context as any).user.affiliation = 'owner';
    } else {
      (payload.context as any).user.affiliation = 'member';
    }

    return jwt.sign(payload, appSecret, { algorithm: 'HS256' });
  }
}
