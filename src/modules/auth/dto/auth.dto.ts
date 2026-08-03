import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterPatientDto {
  @ApiProperty({ example: 'patient@email.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])[A-Za-z\d@$!%*?&^#]+$/,
    {
      message:
        'Password must contain uppercase, lowercase, number and special character',
    },
  )
  password!: string;

  @ApiProperty({ example: 'Amine' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Ben Ali' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ example: '+21612345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;
}

export class RegisterPsychologistDto {
  @ApiProperty({ example: 'psy@email.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])[A-Za-z\d@$!%*?&^#]+$/,
    {
      message:
        'Password must contain uppercase, lowercase, number and special character',
    },
  )
  password!: string;

  @ApiProperty({ example: 'Sonia' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Trabelsi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'LIC-2024-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  licenseNumber!: string;

  @ApiPropertyOptional({ example: '+21698765432' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@email.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ example: '123456', description: '6-digit 2FA code' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  twoFactorCode?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@email.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Reset token received via email' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])[A-Za-z\d@$!%*?&^#]+$/,
    {
      message:
        'Password must contain uppercase, lowercase, number and special character',
    },
  )
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])[A-Za-z\d@$!%*?&^#]+$/,
    {
      message:
        'Password must contain uppercase, lowercase, number and special character',
    },
  )
  newPassword!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Email verification token' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class Enable2FaDto {
  @ApiProperty({ description: '6-digit TOTP code to confirm setup' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code!: string;
}

export class Verify2FaDto {
  @ApiProperty({ description: '6-digit TOTP code' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code!: string;
}
