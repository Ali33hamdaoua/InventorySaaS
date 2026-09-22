import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      "Retourne l'ensemble des KPI, variations, datasets, recommandations et résumé business pour le dashboard",
  })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  summary(
    @Query('periodId') periodId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getSummary(periodId, branchId);
  }

  @Get('kpi')
  @ApiQuery({ name: 'branchId', required: false, type: String })
  kpi(
    @Query('periodId') periodId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getKpiForPeriod(periodId, branchId);
  }

  @Get('critical-products')
  @ApiQuery({ name: 'branchId', required: false, type: String })
  critical(
    @Query('periodId') periodId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getCriticalProducts(periodId, branchId);
  }

  @Get('top-consumed')
  @ApiQuery({ name: 'branchId', required: false, type: String })
  topConsumed(
    @Query('periodId') periodId?: string,
    @Query('limit') limit?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getTopConsumed(periodId, limit ? Number(limit) : 10, branchId);
  }

  @Get('cost-by-category')
  @ApiQuery({ name: 'branchId', required: false, type: String })
  byCategory(
    @Query('periodId') periodId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getCostByCategory(periodId, branchId);
  }

  @Get('food-cost-trend')
  @ApiQuery({ name: 'branchId', required: false, type: String })
  trend(
    @Query('months') months?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getFoodCostTrend(months ? Number(months) : 12, branchId);
  }

  @Get('monthly-purchases')
  @ApiQuery({ name: 'branchId', required: false, type: String })
  monthlyPurchases(
    @Query('months') months?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getMonthlyPurchases(months ? Number(months) : 12, branchId);
  }

  // -------------------- V2 honest endpoints --------------------

  @Get('summary-v2')
  @ApiOperation({
    summary:
      "Snapshot fiable du mois courant pour la succursale ciblée : openingValue, achats, closingValue, cost réel, food cost %, top fournisseur, reportStatus",
  })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  summaryV2(
    @Query('periodId') periodId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getSummaryV2(periodId, branchId);
  }

  @Get('top-purchased-products')
  @ApiOperation({
    summary:
      "Top produits par valeur d'achat dans la période (basé sur PurchaseItems, jamais sur les ventes)",
  })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  topPurchased(
    @Query('periodId') periodId?: string,
    @Query('limit') limit?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getTopPurchasedProducts(periodId, limit ? Number(limit) : 10, branchId);
  }

  @Get('category-donuts')
  @ApiOperation({
    summary:
      'Trois donuts FOOD / PAPIERS / NETTOYAGE — répartition des achats du mois par produit',
  })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  categoryDonuts(
    @Query('periodId') periodId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getCategoryDonuts(periodId, branchId);
  }

  @Get('watch-products')
  @ApiOperation({
    summary:
      "Produits dont la quantité de fin d'inventaire saisie est sous leur seuil minimum",
  })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  watchProducts(
    @Query('periodId') periodId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getWatchProducts(periodId, branchId);
  }
}
