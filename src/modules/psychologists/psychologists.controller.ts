import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PsychologistsService } from './psychologists.service';
import {
  UpdatePsychologistProfileDto,
  UpdateSpecialtiesDto,
  AddCertificateDto,
  SetVacationModeDto,
  UpdateAvailabilityDto,
  PsychologistQueryDto,
  CreateAvailabilityExceptionDto,
  UpdateCertificateStatusDto,
} from './dto/psychologist.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Psychologists')
@Controller('psychologists')
export class PsychologistsController {
  constructor(private readonly psychologistsService: PsychologistsService) {}

  // ─── Public Endpoints ────────────────────────────────────────

  @Public()
  @Get()
  @ApiOperation({ summary: 'Browse active psychologists with filters' })
  async findAll(@Query() query: PsychologistQueryDto) {
    return this.psychologistsService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get public psychologist profile' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.psychologistsService.findPublicById(id);
  }

  // ─── Psychologist Own Profile ─────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Get('me/profile')
  @ApiOperation({ summary: 'Get own psychologist profile' })
  async getMyProfile(@CurrentUser('sub') userId: string) {
    return this.psychologistsService.getMyProfile(userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Patch('me/profile')
  @ApiOperation({ summary: 'Update own psychologist profile' })
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdatePsychologistProfileDto,
  ) {
    return this.psychologistsService.updateProfile(userId, dto);
  }

  // ─── Specialties ─────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Put('me/specialties')
  @ApiOperation({ summary: 'Update specialties (replaces all)' })
  async updateSpecialties(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateSpecialtiesDto,
  ) {
    return this.psychologistsService.updateSpecialties(userId, dto);
  }

  // ─── Certificates ─────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Post('me/certificates')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a professional certificate' })
  async addCertificate(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddCertificateDto,
  ) {
    return this.psychologistsService.addCertificate(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Delete('me/certificates/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a certificate' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async deleteCertificate(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) certificateId: string,
  ) {
    return this.psychologistsService.deleteCertificate(userId, certificateId);
  }

  // ─── Availability ─────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Put('me/availability')
  @ApiOperation({ summary: 'Set weekly availability schedule (replaces all)' })
  async updateAvailability(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.psychologistsService.updateAvailability(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Get('me/availability-exceptions')
  @ApiOperation({ summary: 'List own availability exception dates' })
  async listAvailabilityExceptions(@CurrentUser('sub') userId: string) {
    return this.psychologistsService.listAvailabilityExceptions(userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Post('me/availability-exceptions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an availability exception date' })
  async createAvailabilityException(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateAvailabilityExceptionDto,
  ) {
    return this.psychologistsService.createAvailabilityException(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Delete('me/availability-exceptions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an availability exception date' })
  async deleteAvailabilityException(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.psychologistsService.deleteAvailabilityException(userId, id);
  }

  // ─── Vacation Mode ────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PSYCHOLOGIST)
  @Patch('me/vacation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable or disable vacation mode' })
  async setVacationMode(
    @CurrentUser('sub') userId: string,
    @Body() dto: SetVacationModeDto,
  ) {
    return this.psychologistsService.setVacationMode(userId, dto);
  }

  // ─── Admin Endpoints ─────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch('admin/certificates/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[ADMIN] Approve or reject a psychologist certificate' })
  async updateCertificateStatus(
    @CurrentUser('sub') adminUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCertificateStatusDto,
  ) {
    return this.psychologistsService.updateCertificateStatus(adminUserId, id, dto.status as any);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/all')
  @ApiOperation({ summary: '[ADMIN] List all psychologists including pending' })
  async findAllAdmin(@Query() query: PsychologistQueryDto) {
    return this.psychologistsService.findAllAdmin(query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/:id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[ADMIN] Verify and activate a psychologist' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async verify(@Param('id', ParseUUIDPipe) id: string) {
    return this.psychologistsService.verifyPsychologist(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[ADMIN] Suspend a psychologist' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.psychologistsService.suspendPsychologist(id);
  }
}
