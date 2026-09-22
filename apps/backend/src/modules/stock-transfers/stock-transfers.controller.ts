import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Permission } from '@inventorymdb/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';

@Controller('stock-transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockTransfersController {
  constructor(private readonly stockTransfersService: StockTransfersService) {}

  @Post()
  @RequirePermission(Permission.MANAGE_TRANSFERS)
  async transfer(
    @Body() createStockTransferDto: CreateStockTransferDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.stockTransfersService.transfer(createStockTransferDto, user);
  }

  @Get()
  @RequirePermission(Permission.MANAGE_TRANSFERS)
  async findAll(@CurrentUser() user: RequestUser) {
    return this.stockTransfersService.findAll(user);
  }
}
