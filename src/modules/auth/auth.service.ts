import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CryptoUtil } from '../../common/utils/crypto.util';
import {
  RegisterPatientDto,
  RegisterPsychologistDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  Enable2FaDto,
} from './dto/auth.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { CACHE_KEYS } from '../../common/constants/app.constants';
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse extends AuthTokens {
  user: {
    id: string;
    email: string;
    role: UserRole;
    isEmailVerified: boolean;
    isTwoFactorEnabled: boolean;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly crypto: CryptoUtil;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.crypto = new CryptoUtil(
      this.configService.get<string>('security.encryptionKey')!,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────────────────────

  async registerPatient(
    dto: RegisterPatientDto,
    ip: string,
  ): Promise<{ message: string; userId: string; recoveryKey?: string }> {
    const rawPseudo = dto.pseudo?.trim();
    const cleanPseudo = rawPseudo ? rawPseudo.replace(/\s+/g, '_') : undefined;

    // Resolve email
    let emailToUse: string;
    if (dto.email && dto.email.trim().length > 0) {
      emailToUse = dto.email.toLowerCase().trim();
    } else if (cleanPseudo) {
      emailToUse = `${cleanPseudo.toLowerCase()}@anonymous.monpsy.tn`;
    } else {
      throw new BadRequestException('Veuillez renseigner un email ou un pseudo');
    }

    await this.assertEmailUnique(emailToUse);

    const passwordHash = await this.hashPassword(dto.password);
    const firstNameToUse = (dto.firstName?.trim() || cleanPseudo || 'Patient');
    const lastNameToUse = (dto.lastName?.trim() || '');
    const isAnonymous = !dto.email || !!cleanPseudo;
    const anonymousNameToUse = cleanPseudo || `${firstNameToUse}`;

    // Generate random recovery key
    const recoveryKey = `PSY-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: emailToUse,
          passwordHash,
          role: UserRole.PATIENT,
          isEmailVerified: isAnonymous ? true : false,
          patient: {
            create: {
              firstName: firstNameToUse,
              lastName: lastNameToUse,
              phoneNumber: dto.phoneNumber,
              isAnonymous,
              anonymousName: anonymousNameToUse,
            },
          },
        },
        select: { id: true, email: true },
      });
      return user;
    });

    if (!isAnonymous) {
      await this.issueEmailVerificationToken(result.id);
    }

    this.logger.log(`Patient registered: ${result.email} (Anon: ${isAnonymous}) from IP ${ip}`);

    return {
      message: 'Inscription réussie. Bienvenue sur MonPsy !',
      userId: result.id,
      recoveryKey,
    };
  }

  async registerPsychologist(
    dto: RegisterPsychologistDto,
    ip: string,
  ): Promise<{ message: string; userId: string }> {
    await this.assertEmailUnique(dto.email);
    await this.assertLicenseUnique(dto.licenseNumber);

    const passwordHash = await this.hashPassword(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          role: UserRole.PSYCHOLOGIST,
          psychologist: {
            create: {
              firstName: dto.firstName.trim(),
              lastName: dto.lastName.trim(),
              licenseNumber: dto.licenseNumber.trim(),
              phoneNumber: dto.phoneNumber,
            },
          },
        },
        select: { id: true, email: true },
      });
      return user;
    });

    await this.issueEmailVerificationToken(result.id);

    this.logger.log(`Psychologist registered: ${result.email} from IP ${ip}`);

    return {
      message:
        'Registration successful. Your profile will be reviewed by our team.',
      userId: result.id,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // LOGIN (Supports Email or Pseudo)
  // ─────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ip: string,
    userAgent: string,
  ): Promise<LoginResponse | { requiresTwoFactor: boolean; userId: string }> {
    const rawInput = dto.email.toLowerCase().trim();
    
    // 1. Try finding direct user by email
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: rawInput },
          { email: `${rawInput}@anonymous.monpsy.tn` },
          { patient: { anonymousName: { equals: rawInput, mode: 'insensitive' } } },
        ],
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        isTwoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Your account has been suspended');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Handle 2FA
    if (user.isTwoFactorEnabled) {
      if (!dto.twoFactorCode) {
        return { requiresTwoFactor: true, userId: user.id };
      }
      const decryptedSecret = this.crypto.decrypt(user.twoFactorSecret!);
      const isValid = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: 'base32',
        token: dto.twoFactorCode,
        window: 1,
      });
      if (!isValid) {
        throw new UnauthorizedException('Invalid two-factor authentication code');
      }
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip },
    });

    const tokens = await this.generateAndStoreTokens(
      user.id,
      user.email,
      user.role,
      ip,
      userAgent,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = CryptoUtil.hash(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Invalidate cached user
    await this.redisService.del(CACHE_KEYS.USER(userId));
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.redisService.del(CACHE_KEYS.USER(userId));
  }

  // ─────────────────────────────────────────────────────────────
  // TOKEN REFRESH
  // ─────────────────────────────────────────────────────────────

  async refreshTokens(
    userId: string,
    refreshToken: string,
    ip: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    const tokenHash = CryptoUtil.hash(refreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: { id: true, email: true, role: true, isActive: true },
        },
      },
    });

    if (!storedToken) {
      // Possible token theft — revoke all tokens for this user
      await this.logoutAll(userId);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!storedToken.user.isActive) {
      throw new ForbiddenException('Account is inactive');
    }

    // Revoke old token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return this.generateAndStoreTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.role,
      ip,
      userAgent,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // EMAIL VERIFICATION
  // ─────────────────────────────────────────────────────────────

  async verifyEmail(token: string): Promise<{ message: string }> {
    const tokenHash = CryptoUtil.hash(token);

    const verification = await this.prisma.emailVerification.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!verification) {
      throw new BadRequestException('Invalid verification token');
    }
    if (verification.verifiedAt) {
      return { message: 'Email already verified' };
    }
    if (verification.expiresAt < new Date()) {
      throw new BadRequestException(
        'Verification token has expired. Please request a new one.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { verifiedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { isEmailVerified: true },
      }),
    ]);

    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isEmailVerified: true },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Invalidate any existing tokens
    await this.prisma.emailVerification.updateMany({
      where: { userId, verifiedAt: null },
      data: { expiresAt: new Date() },
    });

    await this.issueEmailVerificationToken(userId);

    return { message: 'Verification email sent' };
  }

  // ─────────────────────────────────────────────────────────────
  // PASSWORD MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim(), deletedAt: null },
      select: { id: true, email: true },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If an account exists, a reset link has been sent' };
    }

    // Revoke any existing reset tokens
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { expiresAt: new Date() },
    });

    await this.issuePasswordResetToken(user.id);

    return { message: 'If an account exists, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = CryptoUtil.hash(dto.token);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const newPasswordHash = await this.hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all refresh tokens
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.redisService.del(CACHE_KEYS.USER(resetToken.userId));

    return { message: 'Password reset successfully. Please log in.' };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must differ from current password',
      );
    }

    const newPasswordHash = await this.hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      }),
      // Revoke all refresh tokens (security best practice)
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Password changed successfully. Please log in again.' };
  }

  // ─────────────────────────────────────────────────────────────
  // TWO-FACTOR AUTHENTICATION
  // ─────────────────────────────────────────────────────────────

  async generate2FaSecret(
    userId: string,
    email: string,
  ): Promise<{ secret: string; qrCode: string; manualKey: string }> {
    const appName = this.configService.get<string>('twoFactor.appName');

    const secret = speakeasy.generateSecret({
      name: `${appName} (${email})`,
      length: 32,
    });

    // Store encrypted secret temporarily (not yet enabled)
    const encryptedSecret = this.crypto.encrypt(secret.base32);
    await this.redisService.set(
      CACHE_KEYS.TWO_FACTOR(userId),
      encryptedSecret,
      300, // 5 minutes to complete setup
    );

    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCode,
      manualKey: secret.base32,
    };
  }

  async enable2Fa(userId: string, dto: Enable2FaDto): Promise<{ message: string; backupCodes: string[] }> {
    const encryptedSecret = await this.redisService.get(
      CACHE_KEYS.TWO_FACTOR(userId),
    );

    const secret = encryptedSecret
      ? this.crypto.decrypt(encryptedSecret)
      : (dto as any).secret;

    if (!secret) {
      throw new BadRequestException('2FA setup session expired. Please restart.');
    }

    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: dto.code,
      window: 1,
    });

    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: true,
        twoFactorSecret: this.crypto.encrypt(secret),
      },
    });

    await this.redisService.del(CACHE_KEYS.TWO_FACTOR(userId));

    // Generate backup codes (simple random strings)
    const backupCodes = Array.from({ length: 8 }, () =>
      uuidv4().replace(/-/g, '').substring(0, 10).toUpperCase(),
    );

    return {
      message: 'Two-factor authentication enabled successfully',
      backupCodes,
    };
  }

  async disable2Fa(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isTwoFactorEnabled: true, twoFactorSecret: true },
    });

    if (!user?.isTwoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    const secret = this.crypto.decrypt(user.twoFactorSecret!);
    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: false, twoFactorSecret: null },
    });

    return { message: 'Two-factor authentication disabled' };
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  private async generateAndStoreTokens(
    userId: string,
    email: string,
    role: UserRole,
    ip: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessSecret = this.configService.get<string>('jwt.accessSecret');
    const accessExpiry = this.configService.get<string>('jwt.accessExpiry');
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret');
    const refreshExpiry = this.configService.get<string>('jwt.refreshExpiry');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiry,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: refreshExpiry,
      }),
    ]);

    const tokenHash = CryptoUtil.hash(refreshToken);
    const expiresAt = new Date(Date.now() + this.parseDurationMs(refreshExpiry || '7d'));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, ip, userAgent },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseDurationMs(accessExpiry || '15m') / 1000,
    };
  }

  private async issueEmailVerificationToken(userId: string): Promise<string> {
    const token = uuidv4();
    const tokenHash = CryptoUtil.hash(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.prisma.emailVerification.create({
      data: { userId, tokenHash, expiresAt },
    });

    // TODO: Queue email job
    this.logger.debug(`Email verification token issued for user ${userId}: ${token}`);

    return token;
  }

  private async issuePasswordResetToken(userId: string): Promise<string> {
    const token = uuidv4();
    const tokenHash = CryptoUtil.hash(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await this.prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    // TODO: Queue email job
    this.logger.debug(`Password reset token issued for user ${userId}`);

    return token;
  }

  private async hashPassword(password: string): Promise<string> {
    const rounds = this.configService.get<number>('security.bcryptRounds') || 12;
    return bcrypt.hash(password, rounds);
  }

  private async assertEmailUnique(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
  }

  private async assertLicenseUnique(licenseNumber: string): Promise<void> {
    const existing = await this.prisma.psychologist.findUnique({
      where: { licenseNumber: licenseNumber.trim() },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('This license number is already registered');
    }
  }

  /**
   * Parses duration strings like '15m', '7d', '1h' into milliseconds.
   */
  private parseDurationMs(duration: string): number {
    const match = duration.match(/^(\d+)(s|m|h|d|w)$/);
    if (!match) return 15 * 60 * 1000; // Default 15 minutes
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
    };
    return value * (multipliers[unit] || 60 * 1000);
  }
}
