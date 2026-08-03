import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Availability')
@Controller('psychologists')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Public()
  @Get(':id/availability')
  @ApiOperation({ summary: 'Get availability time slots for a psychologist on a given date (YYYY-MM-DD)' })
  async getAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('date') date: string,
  ) {
    return this.availabilityService.getAvailabilityForDate(id, date);
  }
}
