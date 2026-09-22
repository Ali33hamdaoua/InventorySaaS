import { Module } from '@nestjs/common';
import { InventoryLinesService } from './inventory-lines.service';
import { InventoryLinesController } from './inventory-lines.controller';

@Module({
  controllers: [InventoryLinesController],
  providers: [InventoryLinesService],
  exports: [InventoryLinesService],
})
export class InventoryLinesModule {}
