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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { SetSupplierStatusDto } from './dto/set-status.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  @ApiOperation({
    summary:
      'Liste des fournisseurs avec filtres (search, isActive) et stats optionnelles (purchasesCount, totalPurchasedAmount, lastPurchaseDate)',
  })
  findAll(@Query() q: ListSuppliersDto) {
    return this.service.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @RequirePermission(Permission.MANAGE_SUPPLIERS)
  @Post()
  @Audit({ action: 'CREATE', entity: 'Supplier' })
  create(@Body() dto: CreateSupplierDto) {
    return this.service.create(dto);
  }

  @RequirePermission(Permission.MANAGE_SUPPLIERS)
  @Patch(':id')
  @Audit({ action: 'UPDATE', entity: 'Supplier' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) {
    return this.service.update(id, dto);
  }

  @RequirePermission(Permission.MANAGE_SUPPLIERS)
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Active/désactive un fournisseur (jamais de suppression physique)',
  })
  @Audit({ action: 'UPDATE', entity: 'Supplier' })
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetSupplierStatusDto) {
    return this.service.setStatus(id, dto.isActive);
  }

  @RequirePermission(Permission.MANAGE_SUPPLIERS)
  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete (isActive=false). Refusé si des achats sont liés.',
  })
  @Audit({ action: 'DELETE', entity: 'Supplier' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
