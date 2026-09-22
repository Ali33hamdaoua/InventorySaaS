import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '@inventorymdb/shared';
import { AuditLogsService } from './audit-logs.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('audit-logs')
@ApiBearerAuth()
@RequirePermission(Permission.VIEW_AUDIT_LOGS)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  findAll(@Query() q: PaginationDto) {
    return this.service.findAll(q);
  }
}
