import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AccountingCategoriesController } from './accounting-categories.controller';
import { AccountingCategoriesService } from './accounting-categories.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountingCategoriesController],
  providers: [AccountingCategoriesService],
  // Exported so the AccountingModule, PurchasesModule and RepairsModule can
  // call `findOrCreate` when they sync expenses or accept a free-form name.
  exports: [AccountingCategoriesService],
})
export class AccountingCategoriesModule {}
