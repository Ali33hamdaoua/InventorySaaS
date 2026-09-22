import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@inventorymdb/shared';
import { FinancialReportsService } from './financial-reports.service';
import { UpdateFinancialReportDto } from './dto/update-financial-report.dto';
import { GetFinancialReportDto } from './dto/get-financial-report.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';

@ApiTags('financial-reports')
@ApiBearerAuth()
@Controller('financial-reports')
export class FinancialReportsController {
  constructor(private readonly service: FinancialReportsService) {}

  @RequirePermission(Permission.MANAGE_FINANCIAL_REPORTS)
  @Get()
  @ApiOperation({
    summary:
      "Récupère (ou crée à la volée) le rapport financier mensuel pour la succursale + mois + année. " +
      "DRAFT : valeurs calculées en live. LOCKED : snapshot.",
  })
  getOrCreate(@Query() q: GetFinancialReportDto, @CurrentUser() user: RequestUser) {
    return this.service.getOrCreate(q.branchId, q.month, q.year, user);
  }

  @RequirePermission(Permission.MANAGE_FINANCIAL_REPORTS)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.getById(id, user);
  }

  @RequirePermission(Permission.MANAGE_FINANCIAL_REPORTS)
  @Patch(':id')
  @Audit({ action: 'UPDATE', entity: 'FinancialReport' })
  @ApiOperation({
    summary:
      "Met à jour les revenus + labor + notes (DRAFT). OWNER/ADMIN peut aussi modifier un LOCKED.",
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFinancialReportDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @RequirePermission(Permission.LOCK_FINANCIAL_REPORT)
  @Post(':id/lock')
  @Audit({ action: 'UPDATE', entity: 'FinancialReport' })
  @ApiOperation({
    summary: 'Verrouille le rapport : snapshot des valeurs calculées, status = LOCKED.',
  })
  lock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.lock(id, user);
  }

  @RequirePermission(Permission.LOCK_FINANCIAL_REPORT)
  @Post(':id/unlock')
  @Audit({ action: 'UPDATE', entity: 'FinancialReport' })
  @ApiOperation({ summary: 'Déverrouille un rapport (status = DRAFT). Garde le snapshot pour audit.' })
  unlock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.unlock(id, user);
  }
}
