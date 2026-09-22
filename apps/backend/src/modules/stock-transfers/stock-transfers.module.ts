import { Module } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import { StockTransfersController } from './stock-transfers.controller';
import { InventoryLinesModule } from '../inventory-lines/inventory-lines.module';

@Module({
  imports: [InventoryLinesModule],
  controllers: [StockTransfersController],
  providers: [StockTransfersService],
})
export class StockTransfersModule {}
