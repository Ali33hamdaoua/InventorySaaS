import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '@inventorymdb/shared';
import { InventoryLinesService } from './inventory-lines.service';
import { BulkLinesDto, UpsertLineDto } from './dto/upsert-line.dto';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('inventory-lines')
@ApiBearerAuth()
@Controller('inventory-periods/:periodId/lines')
export class InventoryLinesController {
  constructor(private readonly service: InventoryLinesService) {}

  @Get()
  findByPeriod(@Param('periodId', ParseUUIDPipe) periodId: string) {
    return this.service.findByPeriod(periodId);
  }

  @RequirePermission(Permission.MANAGE_INVENTORY)
  @Put()
  @Audit({ action: 'UPDATE', entity: 'InventoryLine' })
  upsertOne(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Body() dto: UpsertLineDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.upsertOne(periodId, dto, user);
  }

  @RequirePermission(Permission.MANAGE_INVENTORY)
  @Post('bulk')
  @Audit({ action: 'UPDATE', entity: 'InventoryLine' })
  bulk(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Body() dto: BulkLinesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.bulkUpsert(periodId, dto, user);
  }
}
