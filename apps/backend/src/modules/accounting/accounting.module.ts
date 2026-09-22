import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { AccountingCategoriesModule } from '../accounting-categories/accounting-categories.module';

@Module({
  imports: [AccountingCategoriesModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
