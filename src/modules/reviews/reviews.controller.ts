import {
  Patch,
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/review.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

class UpdateReviewVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  isVisible!: boolean;
}

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PATIENT)
  @Post('reviews')
  @ApiOperation({ summary: 'Submit a review for a completed appointment session' })
  async create(@CurrentUser('sub') userId: string, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(userId, dto);
  }

  @Public()
  @Get('psychologists/:id/reviews')
  @ApiOperation({ summary: 'Get list of public reviews for a psychologist' })
  async listForPsychologist(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationDto,
  ) {
    return this.reviewsService.getPsychologistReviews(id, query.page, query.limit);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('reviews/admin')
  @ApiOperation({ summary: '[ADMIN] List all reviews for moderation' })
  async listAllReviews(@Query() query: PaginationDto) {
    return this.reviewsService.getAllReviews(query.page, query.limit);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch('reviews/admin/:id/visibility')
  @ApiOperation({ summary: '[ADMIN] Toggle review visibility' })
  async updateVisibility(
    @CurrentUser('sub') adminUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewVisibilityDto,
  ) {
    return this.reviewsService.updateVisibility(adminUserId, id, dto.isVisible);
  }
}
