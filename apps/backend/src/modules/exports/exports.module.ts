import { Module } from '@nestjs/common';
import { ExportsService } from './exports.service';
import { ExportsController } from './exports.controller';
import { ProductsModule } from '../products/products.module';
import { CategoriesModule } from '../categories/categories.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { InventoryPeriodsModule } from '../inventory-periods/inventory-periods.module';
import { InventoryLinesModule } from '../inventory-lines/inventory-lines.module';
import { AccountingModule } from '../accounting/accounting.module';
import { FinancialReportsModule } from '../financial-reports/financial-reports.module';

@Module({
  imports: [
    ProductsModule,
    CategoriesModule,
    SuppliersModule,
    PurchasesModule,
    InventoryPeriodsModule,
    InventoryLinesModule,
    AccountingModule,
    FinancialReportsModule,
  ],
  controllers: [ExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
