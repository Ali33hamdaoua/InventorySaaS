import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { InventoryPeriodsModule } from './modules/inventory-periods/inventory-periods.module';
import { InventoryLinesModule } from './modules/inventory-lines/inventory-lines.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ExportsModule } from './modules/exports/exports.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AccountingCategoriesModule } from './modules/accounting-categories/accounting-categories.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { FinancialReportsModule } from './modules/financial-reports/financial-reports.module';
import { LaborModule } from './modules/labor/labor.module';
import { RepairsModule } from './modules/repairs/repairs.module';
import { StockTransfersModule } from './modules/stock-transfers/stock-transfers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, expandVariables: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => [
        {
          ttl: Number(cfg.get('THROTTLE_TTL') ?? 60) * 1000,
          limit: Number(cfg.get('THROTTLE_LIMIT') ?? 120),
        },
      ],
    }),

    PrismaModule,

    AuthModule,
    UsersModule,
    BranchesModule,
    CategoriesModule,
    ProductsModule,
    SuppliersModule,
    PurchasesModule,
    InventoryPeriodsModule,
    InventoryLinesModule,
    DashboardModule,
    ExportsModule,
    AccountingCategoriesModule,
    AccountingModule,
    AuditLogsModule,
    FinancialReportsModule,
    LaborModule,
    RepairsModule,
    StockTransfersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
