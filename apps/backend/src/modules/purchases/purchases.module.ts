import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { AccountingCategoriesModule } from '../accounting-categories/accounting-categories.module';

@Module({
  imports: [AccountingCategoriesModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
