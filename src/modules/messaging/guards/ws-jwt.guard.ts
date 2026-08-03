import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client = context.switchToWs().getClient();
      const token = client.handshake.headers.authorization?.split(' ')[1] || client.handshake.query.token;

      if (!token) return false;

      const secret = this.config.get<string>('jwt.accessSecret');
      const payload = await this.jwtService.verifyAsync(token, { secret });
      
      // Inject payload into handshake query/headers to verify sender later
      client.handshake.query.userId = payload.sub;
      client.handshake.query.userRole = payload.role;

      return true;
    } catch {
      return false;
    }
  }
}
