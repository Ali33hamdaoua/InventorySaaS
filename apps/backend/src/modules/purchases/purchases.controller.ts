import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@inventorymdb/shared';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { ListPurchasesDto } from './dto/list-purchases.dto';
import { PurchaseSummaryQueryDto } from './dto/summary-purchases.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';

@ApiTags('purchases')
@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}

  @Get()
  @ApiOperation({
    summary:
      "Liste paginée d'achats (filtres : search, supplierId, startDate, endDate, periodId, branchId). Items optionnels via includeItems.",
  })
  findAll(@Query() q: ListPurchasesDto, @CurrentUser() user: RequestUser) {
    return this.service.findAll(q, user);
  }

  @Get('summary')
  @ApiOperation({
    summary:
      "Stats d'achats pour la période — totaux, count, top fournisseur, panier moyen. Scopable par branchId.",
  })
  summary(@Query() q: PurchaseSummaryQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.summary(q, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @RequirePermission(Permission.MANAGE_PURCHASES)
  @Post()
  @Audit({ action: 'CREATE', entity: 'Purchase' })
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @RequirePermission(Permission.MANAGE_PURCHASES)
  @Patch(':id')
  @Audit({ action: 'UPDATE', entity: 'Purchase' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  /**
   * Hard delete. The previous "soft cancel" workflow (PATCH /:id/cancel) was
   * removed at the client's request — they don't want a validated/cancelled
   * status. PurchaseItem cascade clears the lines.
   */
  @RequirePermission(Permission.MANAGE_PURCHASES)
  @Delete(':id')
  @ApiOperation({ summary: 'Supprime définitivement un achat (et ses lignes)' })
  @Audit({ action: 'DELETE', entity: 'Purchase' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.remove(id, user);
  }
}
