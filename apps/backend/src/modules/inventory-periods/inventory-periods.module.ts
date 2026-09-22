import { Module } from '@nestjs/common';
import { InventoryPeriodsService } from './inventory-periods.service';
import { InventoryPeriodsController } from './inventory-periods.controller';

@Module({
  controllers: [InventoryPeriodsController],
  providers: [InventoryPeriodsService],
  exports: [InventoryPeriodsService],
})
export class InventoryPeriodsModule {}
