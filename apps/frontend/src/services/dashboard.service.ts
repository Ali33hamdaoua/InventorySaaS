import api from '@/lib/api';
import type {
  DashboardKpi,
  DashboardSummary,
  CategoryCostBreakdown,
  TopConsumedProduct,
  CriticalProduct,
  FoodCostTrendPoint,
  MonthlyPurchasesPoint,
  TopPurchasedProduct,
  WatchProduct,
  CategoryDonutsResponse,
  PeriodStatus,
  ReportStatus,
} from '@inventorymdb/shared';

export interface DashboardSummaryV2 {
  activePeriod: { id: string; month: number; year: number; status: PeriodStatus } | null;
  openingValue: number;
  purchasesValue: number;
  closingValue: number;
  realCost: number;
  salesRevenue: number | null;
  foodCostPercentage: number | null;
  purchasesCount: number;
  topSupplier: { id: string; name: string; totalAmount: number } | null;
  reportStatus: ReportStatus;
}

export const dashboardService = {
  /** Legacy V1 — kept for backwards compatibility with components that still use it. */
  summary: (periodId?: string, branchId?: string) =>
    api.get<DashboardSummary>('/dashboard/summary', { params: { periodId, branchId } }).then((r) => r.data),

  kpi: (periodId?: string, branchId?: string) =>
    api.get<DashboardKpi>('/dashboard/kpi', { params: { periodId, branchId } }).then((r) => r.data),

  critical: (periodId?: string, branchId?: string) =>
    api
      .get<CriticalProduct[]>('/dashboard/critical-products', { params: { periodId, branchId } })
      .then((r) => r.data),

  topConsumed: (periodId?: string, limit = 10, branchId?: string) =>
    api
      .get<TopConsumedProduct[]>('/dashboard/top-consumed', { params: { periodId, limit, branchId } })
      .then((r) => r.data),

  byCategory: (periodId?: string, branchId?: string) =>
    api
      .get<CategoryCostBreakdown[]>('/dashboard/cost-by-category', { params: { periodId, branchId } })
      .then((r) => r.data),

  trend: (months = 12, branchId?: string) =>
    api
      .get<FoodCostTrendPoint[]>('/dashboard/food-cost-trend', { params: { months, branchId } })
      .then((r) => r.data),

  monthlyPurchases: (months = 12, branchId?: string) =>
    api
      .get<MonthlyPurchasesPoint[]>('/dashboard/monthly-purchases', { params: { months, branchId } })
      .then((r) => r.data),

  // ----- V2 honest endpoints -----

  summaryV2: (periodId?: string, branchId?: string) =>
    api
      .get<DashboardSummaryV2>('/dashboard/summary-v2', { params: { periodId, branchId } })
      .then((r) => r.data),

  topPurchased: (periodId?: string, limit = 10, branchId?: string) =>
    api
      .get<TopPurchasedProduct[]>('/dashboard/top-purchased-products', {
        params: { periodId, limit, branchId },
      })
      .then((r) => r.data),

  categoryDonuts: (periodId?: string, branchId?: string) =>
    api
      .get<CategoryDonutsResponse>('/dashboard/category-donuts', { params: { periodId, branchId } })
      .then((r) => r.data),

  watchProducts: (periodId?: string, branchId?: string) =>
    api
      .get<WatchProduct[]>('/dashboard/watch-products', { params: { periodId, branchId } })
      .then((r) => r.data),
};
