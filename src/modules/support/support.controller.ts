import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { CreateTicketDto, ReplyTicketDto, AssignTicketDto, UpdateTicketStatusDto } from './dto/support.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a new support ticket' })
  async create(@CurrentUser('sub') userId: string, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get list of own support tickets' })
  async getMy(@CurrentUser('sub') userId: string) {
    return this.supportService.getMyTickets(userId);
  }

  // ─── Admin Endpoints (placed before parameter routes) ────────

  @Get('admin/all')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[ADMIN] List all support tickets' })
  async listAll() {
    return this.supportService.listAllTickets();
  }

  // ─── Parameterized Routes ────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a support ticket and its replies' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async getDetails(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.supportService.getTicketDetails(user.sub, user.role, id);
  }

  @Post(':id/replies')
  @ApiOperation({ summary: 'Reply to a support ticket' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async reply(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.supportService.replyToTicket(userId, id, dto);
  }

  @Patch(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[ADMIN] Assign a support ticket' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignTicketDto) {
    return this.supportService.assignTicket(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[ADMIN] Update a support ticket status' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.supportService.updateStatus(id, dto);
  }
}
