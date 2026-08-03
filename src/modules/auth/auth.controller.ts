import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterPatientDto,
  RegisterPsychologistDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto,
  Enable2FaDto,
  Verify2FaDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Registration ───────────────────────────────────────────

  @Public()
  @Post('register/patient')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new patient account' })
  @ApiResponse({ status: 201, description: 'Patient registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async registerPatient(
    @Body() dto: RegisterPatientDto,
    @Ip() ip: string,
  ) {
    return this.authService.registerPatient(dto, ip);
  }

  @Public()
  @Post('register/psychologist')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new psychologist account' })
  @ApiResponse({ status: 201, description: 'Psychologist registered, pending review' })
  @ApiResponse({ status: 409, description: 'Email or license number already exists' })
  async registerPsychologist(
    @Body() dto: RegisterPsychologistDto,
    @Ip() ip: string,
  ) {
    return this.authService.registerPsychologist(dto, ip);
  }

  // ─── Login ──────────────────────────────────────────────────

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login and receive JWT tokens' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Req() req: Request) {
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.authService.login(dto, ip, userAgent);
  }

  // ─── Logout ─────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  async logout(
    @CurrentUser('sub') userId: string,
    @Body() dto: RefreshTokenDto,
  ) {
    await this.authService.logout(userId, dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout/all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  async logoutAll(@CurrentUser('sub') userId: string) {
    await this.authService.logoutAll(userId);
    return { message: 'Logged out from all devices' };
  }

  // ─── Token Refresh ──────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    // Decode userId from the refresh token without verifying
    const userAgent = req.headers['user-agent'] || 'unknown';
    // Parse userId from token payload (we still validate in service)
    const payload = this.parseJwtPayload(dto.refreshToken);
    return this.authService.refreshTokens(payload.sub, dto.refreshToken, ip, userAgent);
  }

  // ─── Email Verification ─────────────────────────────────────

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend email verification link' })
  async resendVerification(@CurrentUser('sub') userId: string) {
    return this.authService.resendVerificationEmail(userId);
  }

  // ─── Password ───────────────────────────────────────────────

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Request password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from email' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (authenticated)' })
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  // ─── Two-Factor Authentication ──────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('2fa/setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate 2FA QR code for setup' })
  async setup2Fa(@CurrentUser() user: JwtPayload) {
    return this.authService.generate2FaSecret(user.sub, user.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable 2FA after confirming TOTP code' })
  async enable2Fa(
    @CurrentUser('sub') userId: string,
    @Body() dto: Enable2FaDto,
  ) {
    return this.authService.enable2Fa(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable 2FA' })
  async disable2Fa(
    @CurrentUser('sub') userId: string,
    @Body() dto: Verify2FaDto,
  ) {
    return this.authService.disable2Fa(userId, dto.code);
  }

  // ─── Private helpers ────────────────────────────────────────

  private parseJwtPayload(token: string): JwtPayload {
    try {
      const [, payload] = token.split('.');
      return JSON.parse(Buffer.from(payload, 'base64url').toString()) as JwtPayload;
    } catch {
      return { sub: '', email: '', role: 'PATIENT' as never };
    }
  }
}
