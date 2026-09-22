import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PeriodStatus } from '@prisma/client';
import { Permission } from '@inventorymdb/shared';
import { InventoryPeriodsService } from './inventory-periods.service';
import { CreatePeriodDto } from './dto/create-period.dto';
import { ClosePeriodDto } from './dto/close-period.dto';
import { BootstrapPeriodDto } from './dto/bootstrap-period.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';

@ApiTags('inventory-periods')
@ApiBearerAuth()
@Controller('inventory-periods')
export class InventoryPeriodsController {
  constructor(private readonly service: InventoryPeriodsService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des périodes avec agrégats live + counts' })
  @ApiQuery({ name: 'status', required: false, enum: PeriodStatus })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('status') status?: PeriodStatus,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.findAll(status, user, branchId);
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'Snapshot Inventory : période ouverte, dernière clôturée, critical count, achats du mois. Scopé par branche.',
  })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  summary(@CurrentUser() user: RequestUser, @Query('branchId') branchId?: string) {
    return this.service.summary(user, branchId);
  }

  @Get('current')
  @ApiQuery({ name: 'branchId', required: false, type: String })
  current(@CurrentUser() user: RequestUser, @Query('branchId') branchId?: string) {
    return this.service.findCurrent(user, branchId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /**
   * One-shot bootstrap of the very first inventory period for a branch.
   * Rejected if any period already exists — after bootstrap the auto-create
   * flow on close() takes over and the user never needs to touch this again.
   */
  @RequirePermission(Permission.MANAGE_INVENTORY)
  @Post('bootstrap')
  @ApiOperation({
    summary:
      "Initialise la première période d'inventaire pour la succursale (refusée si déjà initialisée). Seed les lignes pour tous les produits actifs.",
  })
  @Audit({ action: 'CREATE', entity: 'InventoryPeriod' })
  bootstrap(@Body() dto: BootstrapPeriodDto, @CurrentUser() user: RequestUser) {
    return this.service.bootstrap(dto, user);
  }

  /**
   * Manual period creation — OWNER/ADMIN override path only. Not exposed in
   * the UI; the normal flow is bootstrap + auto-create at closure.
   */
  @RequirePermission(Permission.OVERRIDE_INVENTORY_PERIOD)
  @Post()
  @ApiOperation({
    summary:
      'Crée manuellement une période (override admin). Le flux normal est bootstrap + auto-création à la clôture.',
  })
  @Audit({ action: 'CREATE', entity: 'InventoryPeriod' })
  create(@Body() dto: CreatePeriodDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @RequirePermission(Permission.MANAGE_INVENTORY)
  @Post(':id/close')
  @ApiOperation({
    summary:
      'Clôture la période : agrège les achats, génère le rapport, crée et seed la période suivante automatiquement.',
  })
  @Audit({ action: 'CLOSE_PERIOD', entity: 'InventoryPeriod' })
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClosePeriodDto) {
    return this.service.close(id, dto);
  }

  /**
   * Réouvre une période clôturée pour permettre à Owner/Admin de :
   *  - saisir un achat rétroactif (Purchases → assertPeriodEditable ne
   *    bloquera plus tant que la période est OPEN)
   *  - corriger une closing quantity
   *  - re-clôturer avec les nouveaux totaux
   *
   * Le snapshot InventoryReport reste figé jusqu'à la prochaine clôture.
   */
  @RequirePermission(Permission.BYPASS_CLOSED_PERIOD)
  @Post(':id/reopen')
  @ApiOperation({
    summary:
      "Réouvre une période clôturée (OWNER/ADMIN uniquement). Ne perd aucune donnée : lignes, quantités et notes sont conservées.",
  })
  @Audit({ action: 'REOPEN_PERIOD', entity: 'InventoryPeriod' })
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.reopen(id, user);
  }
}
