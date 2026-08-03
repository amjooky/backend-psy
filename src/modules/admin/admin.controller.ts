import {
  Controller,
  UseGuards,
  Get,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Admin Panel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: '[ADMIN] Get admin dashboard count analytics' })
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('revenue')
  @ApiOperation({ summary: '[ADMIN] Get system revenue transaction logs' })
  async getRevenue() {
    return this.adminService.getRevenueReports();
  }

  @Get('users')
  @ApiOperation({ summary: '[ADMIN] List all system users' })
  async getUsers(@Query() query: PaginationDto) {
    return this.adminService.listUsers(query.page, query.limit);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: '[ADMIN] List all system audit logs' })
  async getAuditLogs(@Query() query: PaginationDto) {
    return this.auditService.getLogs(query.page, query.limit);
  }

  @Patch('users/:id/ban')
  @ApiOperation({ summary: '[ADMIN] Ban/deactivate a user' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async banUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.banUser(id);
  }

  @Patch('users/:id/activate')
  @ApiOperation({ summary: '[ADMIN] Activate a banned user' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async activateUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.activateUser(id);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: '[ADMIN] Permanently delete a user' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteUser(id);
  }
}
