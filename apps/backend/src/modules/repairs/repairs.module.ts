import { Module } from '@nestjs/common';
import { RepairsService } from './repairs.service';
import { RepairsController } from './repairs.controller';
import { AccountingCategoriesModule } from '../accounting-categories/accounting-categories.module';

@Module({
  imports: [AccountingCategoriesModule],
  controllers: [RepairsController],
  providers: [RepairsService],
  exports: [RepairsService],
})
export class RepairsModule {}
