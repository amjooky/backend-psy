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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PatientsService } from './patients.service';
import { UpdatePatientProfileDto, UpdateMedicalQuestionnaireDto } from './dto/patient.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  // ─── My Profile ─────────────────────────────────────────────

  @Get('me')
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'Get own patient profile' })
  async getMyProfile(@CurrentUser('sub') userId: string) {
    return this.patientsService.getMyProfile(userId);
  }

  @Patch('me')
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'Update own patient profile' })
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdatePatientProfileDto,
  ) {
    return this.patientsService.updateProfile(userId, dto);
  }

  @Patch('me/questionnaire')
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'Update medical questionnaire' })
  async updateQuestionnaire(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateMedicalQuestionnaireDto,
  ) {
    return this.patientsService.updateMedicalQuestionnaire(userId, dto);
  }

  // ─── Favorites ──────────────────────────────────────────────

  @Get('me/favorites')
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'Get favorite psychologists' })
  async getFavorites(
    @CurrentUser('sub') userId: string,
    @Query() query: PaginationDto,
  ) {
    return this.patientsService.getFavorites(userId, query.page, query.limit);
  }

  @Post('me/favorites/:psychologistId')
  @Roles(UserRole.PATIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add psychologist to favorites' })
  @ApiParam({ name: 'psychologistId', type: 'string', format: 'uuid' })
  async addFavorite(
    @CurrentUser('sub') userId: string,
    @Param('psychologistId', ParseUUIDPipe) psychologistId: string,
  ) {
    return this.patientsService.addFavorite(userId, psychologistId);
  }

  @Delete('me/favorites/:psychologistId')
  @Roles(UserRole.PATIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove psychologist from favorites' })
  @ApiParam({ name: 'psychologistId', type: 'string', format: 'uuid' })
  async removeFavorite(
    @CurrentUser('sub') userId: string,
    @Param('psychologistId', ParseUUIDPipe) psychologistId: string,
  ) {
    return this.patientsService.removeFavorite(userId, psychologistId);
  }

  // ─── Admin: All Patients ─────────────────────────────────────

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[ADMIN] List all patients' })
  async findAll(@Query() query: PaginationDto) {
    return this.patientsService.findAll(query.page, query.limit, query.search);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[ADMIN] Get patient by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientsService.getById(id);
  }
}
