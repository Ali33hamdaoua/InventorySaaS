import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoryType, InventoryPeriod, PeriodStatus, Prisma } from '@prisma/client';
import { categoryTypeToBucket } from '@inventorymdb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  monthStartUTC,
  monthEndExclusiveUTC,
} from '../../common/helpers/business-date.helper';
import { computeConsumptionQuantity } from '../../common/helpers/inventory-math.helper';
import { CURRENCY_SYMBOL, LOCALE } from '../../common/config/brand';

export type RecommendedActionSeverity = 'info' | 'warning' | 'success';

export interface RecommendedAction {
  id: string;
  title: string;
  description: string;
  severity: RecommendedActionSeverity;
  ctaPath?: string;
  ctaLabel?: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /** Resolves the period to use: either the explicit id, or the most recent
   *  OPEN period in the given branch, or â€” as a last resort â€” the most
   *  recent period at all in that branch. When `branchId` is omitted the
   *  search spans all branches (Admin/Owner fallback). */
  private async resolvePeriod(
    periodId?: string,
    branchId?: string,
  ): Promise<InventoryPeriod | null> {
    if (periodId) {
      return this.prisma.inventoryPeriod.findUnique({ where: { id: periodId } });
    }
    const scope = branchId ? { branchId } : {};
    const open = await this.prisma.inventoryPeriod.findFirst({
      where: { status: PeriodStatus.OPEN, ...scope },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    if (open) return open;
    return this.prisma.inventoryPeriod.findFirst({
      where: scope,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  private async findPreviousPeriod(p: InventoryPeriod): Promise<InventoryPeriod | null> {
    const prevMonth = p.month === 1 ? 12 : p.month - 1;
    const prevYear = p.month === 1 ? p.year - 1 : p.year;
    return this.prisma.inventoryPeriod.findUnique({
      where: {
        branchId_year_month: { branchId: p.branchId, year: prevYear, month: prevMonth },
      },
    });
  }

  private async computeSnapshot(period: InventoryPeriod) {
    // Include category type pour ventiler Food/Paper/Cleaning même côté
    // dashboard (sans quoi le KPI breakdown serait incohérent avec le
    // financial report).
    const lines = await this.prisma.inventoryLine.findMany({
      where: { periodId: period.id },
      include: {
        product: {
          select: { category: { select: { categoryType: true } } },
        },
      },
    });
    const start = monthStartUTC(period.year, period.month);
    const end = monthEndExclusiveUTC(period.year, period.month);
    const purchaseAgg = await this.prisma.purchase.aggregate({
      where: {
        branchId: period.branchId,
        purchaseDate: { gte: start, lt: end },
      },
      _sum: { totalAmount: true },
    });
    const purchasesValue = purchaseAgg._sum.totalAmount ?? new Prisma.Decimal(0);

    let openingValue = new Prisma.Decimal(0);
    let closingValue = new Prisma.Decimal(0);
    for (const l of lines) {
      openingValue = openingValue.plus(l.openingQuantity.mul(l.openingUnitCost));
      closingValue = closingValue.plus(l.closingQuantity.mul(l.closingUnitCost));
    }
    const realCost = openingValue.plus(purchasesValue).minus(closingValue);

    const report = await this.prisma.inventoryReport.findUnique({
      where: { periodId: period.id },
    });

    // CLOSED periods : lecture directe du snapshot DB (figé).
    // OPEN periods : ventilation live à partir des lignes (sans achats par
    // bucket → on impute la valeur d'achat globale au prorata). Pour rester
    // simple et précis, on accumule openingValue + closingValue par bucket
    // (à partir des unit costs déjà figés sur les lignes), et on ne
    // ventile PAS les purchases par bucket côté OPEN (le calcul fin se fait
    // à la clôture). Le foodCost/paperCost/cleaningCost de l'OPEN sert
    // d'estimation visuelle, pas de calcul comptable.
    let foodCost: number;
    let paperCost: number;
    let cleaningCost: number;
    if (report) {
      foodCost = report.foodCost.toNumber();
      paperCost = report.paperCost.toNumber();
      cleaningCost = report.cleaningCost.toNumber();
    } else {
      // Approximation OPEN : ventiler opening + closing par bucket.
      // Les achats globaux ne sont pas répartis ici — c'est volontaire,
      // l'estimation reste indicative tant que la période n'est pas
      // clôturée.
      let foodOpen = new Prisma.Decimal(0);
      let paperOpen = new Prisma.Decimal(0);
      let cleaningOpen = new Prisma.Decimal(0);
      let foodClose = new Prisma.Decimal(0);
      let paperClose = new Prisma.Decimal(0);
      let cleaningClose = new Prisma.Decimal(0);
      for (const l of lines) {
        const fam = categoryTypeToBucket(
          l.product.category?.categoryType ?? null,
        );
        const open = l.openingQuantity.mul(l.openingUnitCost);
        const close = l.closingQuantity.mul(l.closingUnitCost);
        if (fam === 'FOOD') {
          foodOpen = foodOpen.plus(open);
          foodClose = foodClose.plus(close);
        } else if (fam === 'PAPER') {
          paperOpen = paperOpen.plus(open);
          paperClose = paperClose.plus(close);
        } else {
          cleaningOpen = cleaningOpen.plus(open);
          cleaningClose = cleaningClose.plus(close);
        }
      }
      foodCost = foodOpen.minus(foodClose).toNumber();
      paperCost = paperOpen.minus(paperClose).toNumber();
      cleaningCost = cleaningOpen.minus(cleaningClose).toNumber();
    }

    return {
      periodId: period.id,
      month: period.month,
      year: period.year,
      status: period.status,
      openingValue: openingValue.toNumber(),
      purchasesValue: purchasesValue.toNumber(),
      closingValue: closingValue.toNumber(),
      realCost: realCost.toNumber(),
      foodCost,
      paperCost,
      cleaningCost,
      salesRevenue: report?.salesRevenue ? report.salesRevenue.toNumber() : null,
      foodCostPercentage: report?.foodCostPercentage
        ? report.foodCostPercentage.toNumber()
        : null,
    };
  }

  private pctChange(current: number, previous: number): number | null {
    if (previous === 0 || previous === null || previous === undefined) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  // -------------------------------------------------------------------
  // Granular endpoints (kept for backwards-compat / lazy reloads)
  // -------------------------------------------------------------------

  async getKpiForPeriod(periodId?: string, branchId?: string) {
    const period = await this.resolvePeriod(periodId, branchId);
    if (!period) throw new NotFoundException('Aucune période trouvée');
    return this.computeSnapshot(period);
  }

  async getCriticalProducts(periodId?: string, branchId?: string) {
    const period = await this.resolvePeriod(periodId, branchId);
    if (!period) return [];

    const lines = await this.prisma.inventoryLine.findMany({
      where: { periodId: period.id },
      include: { product: true },
    });

    return lines
      .filter((l) => {
        if (!l.product.minStockLevel.gt(0)) return false;
        // For OPEN periods where closing inventory hasn't been entered yet,
        // fall back to opening quantity so we don't flag every product.
        const ref = l.closingQuantity.gt(0) ? l.closingQuantity : l.openingQuantity;
        return ref.lte(l.product.minStockLevel);
      })
      .map((l) => {
        const ref = l.closingQuantity.gt(0) ? l.closingQuantity : l.openingQuantity;
        return {
          productId: l.productId,
          productName: l.product.name,
          unit: l.product.unit,
          closingQuantity: ref.toNumber(),
          minStockLevel: l.product.minStockLevel.toNumber(),
        };
      });
  }

  /**
   * Returns consumption qty/value for a line.
   * - If `consumptionValue` was already persisted (CLOSED periods), use it as-is.
   * - Otherwise estimate it from opening + purchases âˆ’ closing (OPEN periods),
   *   so the dashboard never shows empty charts while a period is open.
   */
  private estimateConsumption(l: {
    openingQuantity: Prisma.Decimal;
    openingUnitCost: Prisma.Decimal;
    closingQuantity: Prisma.Decimal;
    closingUnitCost: Prisma.Decimal;
    purchasesQuantity: Prisma.Decimal;
    purchasesValue: Prisma.Decimal;
    transferInQuantity: Prisma.Decimal;
    transferOutQuantity: Prisma.Decimal;
    consumptionQuantity: Prisma.Decimal;
    consumptionValue: Prisma.Decimal;
  }): { quantity: number; value: number } {
    if (l.consumptionValue.gt(0)) {
      return { quantity: l.consumptionQuantity.toNumber(), value: l.consumptionValue.toNumber() };
    }
    const openVal = l.openingQuantity.mul(l.openingUnitCost);
    const closeVal = l.closingQuantity.mul(l.closingUnitCost);
    const qty = computeConsumptionQuantity({
      opening: l.openingQuantity,
      purchases: l.purchasesQuantity,
      transferIn: l.transferInQuantity,
      transferOut: l.transferOutQuantity,
      closing: l.closingQuantity,
    }).toNumber();
    const val = openVal.plus(l.purchasesValue).minus(closeVal).toNumber();
    return { quantity: Math.max(0, qty), value: Math.max(0, val) };
  }

  async getTopConsumed(periodId?: string, limit = 10, branchId?: string) {
    const period = await this.resolvePeriod(periodId, branchId);
    if (!period) return [];
    const lines = await this.prisma.inventoryLine.findMany({
      where: { periodId: period.id },
      include: { product: true },
    });

    return lines
      .map((l) => {
        const c = this.estimateConsumption(l);
        return {
          productId: l.productId,
          productName: l.product.name,
          unit: l.product.unit,
          consumptionQuantity: c.quantity,
          consumptionValue: c.value,
        };
      })
      .filter((l) => l.consumptionValue > 0)
      .sort((a, b) => b.consumptionValue - a.consumptionValue)
      .slice(0, limit);
  }

  async getCostByCategory(periodId?: string, branchId?: string) {
    const period = await this.resolvePeriod(periodId, branchId);
    if (!period) return [];
    const lines = await this.prisma.inventoryLine.findMany({
      where: { periodId: period.id },
      include: { product: { include: { category: true } } },
    });

    const byCat = new Map<string, { categoryId: string; categoryName: string; value: number }>();
    let total = 0;
    for (const l of lines) {
      const id = l.product.categoryId ?? 'none';
      const name = l.product.category?.name ?? 'Non catégorisé';
      const v = this.estimateConsumption(l).value;
      if (v <= 0) continue;
      total += v;
      const cur = byCat.get(id) ?? { categoryId: id, categoryName: name, value: 0 };
      cur.value += v;
      byCat.set(id, cur);
    }
    return Array.from(byCat.values())
      .map((c) => ({
        ...c,
        percentage: total > 0 ? (c.value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }

  async getFoodCostTrend(months = 12, branchId?: string) {
    const reports = await this.prisma.inventoryReport.findMany({
      where: branchId ? { period: { branchId } } : {},
      include: { period: true },
      orderBy: [{ period: { year: 'desc' } }, { period: { month: 'desc' } }],
      take: months,
    });
    return reports
      .reverse()
      .map((r) => ({
        month: r.period.month,
        year: r.period.year,
        realCost: r.realCost.toNumber(),
        // V4 ventilation — frontend peut afficher 3 séries empilées si
        // souhaité, ou rester sur la trend globale. Les snapshots legacy
        // (pré-migration) ont paperCost = cleaningCost = 0, donc la série
        // food épouse la trend historique.
        foodCost: r.foodCost.toNumber(),
        paperCost: r.paperCost.toNumber(),
        cleaningCost: r.cleaningCost.toNumber(),
        foodCostPercentage: r.foodCostPercentage ? r.foodCostPercentage.toNumber() : null,
      }));
  }

  async getMonthlyPurchases(months = 12, branchId?: string) {
    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - months + 1);
    sinceDate.setDate(1);

    const purchases = await this.prisma.purchase.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        purchaseDate: { gte: sinceDate },
      },
      select: { purchaseDate: true, totalAmount: true },
    });

    const map = new Map<string, { month: number; year: number; totalAmount: number }>();
    for (const p of purchases) {
      const d = new Date(p.purchaseDate);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const cur = map.get(key) ?? { month: d.getMonth() + 1, year: d.getFullYear(), totalAmount: 0 };
      cur.totalAmount += p.totalAmount.toNumber();
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month,
    );
  }

  // -------------------------------------------------------------------
  // Aggregated summary â€” single round-trip for the dashboard page
  // -------------------------------------------------------------------

  async getSummary(periodId?: string, branchId?: string) {
    const period = await this.resolvePeriod(periodId, branchId);
    if (!period) {
      // No period at all â€” return a structurally-valid empty summary so the
      // frontend can render the empty state without crashing.
      return this.emptySummary();
    }

    const [current, prevPeriod, trend, monthlyPurchases, categoryBreakdown, topConsumed, criticalProducts] =
      await Promise.all([
        this.computeSnapshot(period),
        this.findPreviousPeriod(period),
        this.getFoodCostTrend(12, period.branchId),
        this.getMonthlyPurchases(12, period.branchId),
        this.getCostByCategory(period.id),
        this.getTopConsumed(period.id, 10),
        this.getCriticalProducts(period.id),
      ]);

    const previous = prevPeriod ? await this.computeSnapshot(prevPeriod) : null;

    const variation = {
      realCostPct: previous ? this.pctChange(current.realCost, previous.realCost) : null,
      purchasesPct: previous ? this.pctChange(current.purchasesValue, previous.purchasesValue) : null,
      foodCostPctDelta:
        previous && previous.foodCostPercentage !== null && current.foodCostPercentage !== null
          ? current.foodCostPercentage - previous.foodCostPercentage
          : null,
      closingValuePct: previous ? this.pctChange(current.closingValue, previous.closingValue) : null,
    };

    const lines = await this.prisma.inventoryLine.findMany({ where: { periodId: period.id } });
    const flags = {
      hasOpeningData: lines.some((l) => l.openingQuantity.gt(0)),
      hasClosingData: lines.some((l) => l.closingQuantity.gt(0)),
      hasSalesRevenue: current.salesRevenue !== null && current.salesRevenue > 0,
      hasCriticalProducts: criticalProducts.length > 0,
      hasPurchases: current.purchasesValue > 0,
      canClose:
        period.status === PeriodStatus.OPEN &&
        lines.length > 0 &&
        lines.some((l) => l.openingQuantity.gt(0)) &&
        lines.some((l) => l.closingQuantity.gt(0)),
    };

    const businessSummary = this.buildBusinessSummary(current, variation, flags);
    const recommendedActions = this.buildRecommendedActions(period, flags, current);

    return {
      current,
      previous,
      variation,
      flags,
      businessSummary,
      recommendedActions,
      trend,
      monthlyPurchases,
      categoryBreakdown,
      topConsumed,
      criticalProducts,
    };
  }

  // -------------------------------------------------------------------
  // Narrative builders
  // -------------------------------------------------------------------

  private buildBusinessSummary(
    current: Awaited<ReturnType<DashboardService['computeSnapshot']>>,
    variation: {
      realCostPct: number | null;
      foodCostPctDelta: number | null;
    },
    flags: { hasSalesRevenue: boolean; hasCriticalProducts: boolean },
  ): string {
    const fmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
    const money = (n: number) => `${fmt.format(n)} ${CURRENCY_SYMBOL}`;
    const realCostStr = money(current.realCost);
    const purchasesStr = money(current.purchasesValue);

    const parts: string[] = [];
    parts.push(
      `Ce mois-ci, vos achats représentent ${purchasesStr} et votre consommation réelle est de ${realCostStr}.`,
    );

    if (flags.hasSalesRevenue && current.foodCostPercentage !== null) {
      const pct = current.foodCostPercentage.toFixed(1);
      const verdict =
        current.foodCostPercentage > 33
          ? ` C'est au-dessus de la cible de 30 % â€” analysez les produits les plus coûteux.`
          : current.foodCostPercentage > 30
            ? ` Vous êtes légèrement au-dessus de l'objectif de 30 %.`
            : ` Vous êtes dans la fourchette saine (â‰¤ 30 %).`;
      parts.push(`Le food cost est de ${pct} %.${verdict}`);
    } else {
      parts.push(
        `Le food cost % n'est pas calculé : renseignez le chiffre d'affaires pour l'obtenir.`,
      );
    }

    if (variation.realCostPct !== null) {
      const sign = variation.realCostPct >= 0 ? '+' : '';
      parts.push(`Variation du cost réel vs mois précédent : ${sign}${variation.realCostPct.toFixed(1)} %.`);
    }

    if (flags.hasCriticalProducts) {
      parts.push(`Attention : certains produits sont sous leur seuil critique.`);
    }

    return parts.join(' ');
  }

  private buildRecommendedActions(
    period: InventoryPeriod,
    flags: {
      hasOpeningData: boolean;
      hasClosingData: boolean;
      hasSalesRevenue: boolean;
      hasCriticalProducts: boolean;
      hasPurchases: boolean;
      canClose: boolean;
    },
    current: { foodCostPercentage: number | null; realCost: number },
  ): RecommendedAction[] {
    const actions: RecommendedAction[] = [];

    if (period.status === PeriodStatus.OPEN && !flags.hasOpeningData) {
      actions.push({
        id: 'enter-opening',
        title: 'Saisir le début d\'inventaire',
        description:
          'Aucune quantité de début n\'est enregistrée. Saisissez-les pour calculer le cost réel.',
        severity: 'warning',
        ctaPath: `/inventory/${period.id}`,
        ctaLabel: 'Saisir',
      });
    }

    if (period.status === PeriodStatus.OPEN && flags.hasOpeningData && !flags.hasClosingData) {
      actions.push({
        id: 'enter-closing',
        title: 'Saisir la fin d\'inventaire',
        description:
          'Les quantités de fin de période ne sont pas encore renseignées. Saisissez-les pour clôturer.',
        severity: 'info',
        ctaPath: `/inventory/${period.id}`,
        ctaLabel: 'Compléter',
      });
    }

    if (!flags.hasPurchases) {
      actions.push({
        id: 'add-purchases',
        title: 'Ajouter les achats du mois',
        description: 'Aucun achat enregistré ce mois. Ajoutez-les pour calculer la consommation.',
        severity: 'info',
        ctaPath: '/purchases',
        ctaLabel: 'Ajouter un achat',
      });
    }

    if (flags.hasCriticalProducts) {
      actions.push({
        id: 'check-critical',
        title: 'Vérifier les produits critiques',
        description:
          'Certains produits sont sous le seuil de stock minimal. Lancez les commandes nécessaires.',
        severity: 'warning',
        ctaPath: '/inventory',
        ctaLabel: 'Voir la liste',
      });
    }

    if (current.foodCostPercentage !== null && current.foodCostPercentage > 33) {
      actions.push({
        id: 'analyze-top-cost',
        title: 'Analyser les catégories les plus coûteuses',
        description:
          'Votre food cost dépasse 33 %. Vérifiez les viandes, fromages et sauces â€” souvent les plus impactants.',
        severity: 'warning',
        ctaPath: `/inventory/${period.id}`,
        ctaLabel: "Voir l'inventaire",
      });
    }

    if (!flags.hasSalesRevenue && period.status === PeriodStatus.OPEN) {
      actions.push({
        id: 'add-sales',
        title: 'Renseigner le chiffre d\'affaires',
        description:
          'Saisissez le CA mensuel pour activer le calcul automatique du food cost %.',
        severity: 'info',
        ctaPath: `/inventory/${period.id}`,
        ctaLabel: 'Compléter',
      });
    }

    if (flags.canClose) {
      actions.push({
        id: 'close-period',
        title: 'Clôturer la période',
        description:
          'Toutes les données nécessaires sont saisies. Clôturez pour générer le rapport mensuel.',
        severity: 'success',
        ctaPath: `/inventory/${period.id}`,
        ctaLabel: 'Clôturer',
      });
    }

    if (actions.length === 0) {
      actions.push({
        id: 'all-good',
        title: 'Données à jour',
        description: 'Aucune action urgente. Suivez l\'évolution dans le graphique food cost.',
        severity: 'success',
      });
    }

    return actions;
  }

  private emptySummary() {
    return {
      current: {
        periodId: '',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        status: PeriodStatus.OPEN,
        openingValue: 0,
        purchasesValue: 0,
        closingValue: 0,
        realCost: 0,
        salesRevenue: null,
        foodCostPercentage: null,
      },
      previous: null,
      variation: {
        realCostPct: null,
        purchasesPct: null,
        foodCostPctDelta: null,
        closingValuePct: null,
      },
      flags: {
        hasOpeningData: false,
        hasClosingData: false,
        hasSalesRevenue: false,
        hasCriticalProducts: false,
        hasPurchases: false,
        canClose: false,
      },
      businessSummary:
        'Aucune période n\'a encore été créée. Créez la période courante pour commencer le suivi.',
      recommendedActions: [
        {
          id: 'create-period',
          title: 'Créer la période courante',
          description: 'Initialisez la période mensuelle pour saisir l\'inventaire et les achats.',
          severity: 'warning' as const,
          ctaPath: '/inventory',
          ctaLabel: 'Créer une période',
        },
      ],
      trend: [],
      monthlyPurchases: [],
      categoryBreakdown: [],
      topConsumed: [],
      criticalProducts: [],
    };
  }

  // -------------------------------------------------------------------
  // V2 â€” Honest dashboard endpoints (no fake "consumption" or stock)
  // -------------------------------------------------------------------

  /**
   * Top products by purchasing volume for the period. Sourced purely from
   * PurchaseItems aggregation â€” explicitly NOT from consumption / sales,
   * which we don't have data for in V1.
   */
  async getTopPurchasedProducts(periodId?: string, limit = 10, branchId?: string) {
    const period = await this.resolvePeriod(periodId, branchId);
    if (!period) return [];

    const start = monthStartUTC(period.year, period.month);
    const end = monthEndExclusiveUTC(period.year, period.month);

    const grouped = await this.prisma.purchaseItem.groupBy({
      by: ['productId'],
      where: {
        purchase: {
          branchId: period.branchId,
          purchaseDate: { gte: start, lt: end },
        },
      },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: limit,
    });

    if (grouped.length === 0) return [];
    const productIds = grouped.map((g) => g.productId);
    const products = await this.prisma.inventoryProduct.findMany({
      where: { id: { in: productIds } },
      include: { category: { select: { name: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return grouped.map((g) => {
      const p = byId.get(g.productId);
      return {
        productId: g.productId,
        productName: p?.name ?? '(supprimé)',
        categoryName: p?.category?.name ?? null,
        unit: p?.unit ?? '',
        quantityPurchased: g._sum.quantity?.toNumber() ?? 0,
        totalPurchasedValue: g._sum.totalPrice?.toNumber() ?? 0,
      };
    });
  }

  /**
   * Three donuts (FOOD / PAPIERS / NETTOYAGE), each grouping purchases of
   * the period by product within that category. Empty objects when no data.
   */
  async getCategoryDonuts(periodId?: string, branchId?: string) {
    const period = await this.resolvePeriod(periodId, branchId);
    const empty = { totalValue: 0, items: [] as { label: string; value: number; percentage: number }[] };
    if (!period) return { food: empty, papiers: empty, nettoyage: empty };

    const start = monthStartUTC(period.year, period.month);
    const end = monthEndExclusiveUTC(period.year, period.month);

    const items = await this.prisma.purchaseItem.findMany({
      where: {
        purchase: {
          branchId: period.branchId,
          purchaseDate: { gte: start, lt: end },
        },
      },
      include: {
        product: { include: { category: { select: { categoryType: true, name: true } } } },
      },
    });

    type Bucket = Map<string, { label: string; value: number }>;
    const buckets: Record<CategoryType, Bucket> = {
      FOOD: new Map(),
      PAPIERS: new Map(),
      NETTOYAGE: new Map(),
      NON_FOOD: new Map(), // legacy, ignored in response
    };

    for (const it of items) {
      const type = it.product.category?.categoryType ?? CategoryType.FOOD;
      const target = buckets[type] ?? buckets.FOOD;
      const label = it.product.name;
      const cur = target.get(label) ?? { label, value: 0 };
      cur.value += it.totalPrice.toNumber();
      target.set(label, cur);
    }

    const toDonut = (bucket: Bucket) => {
      const arr = Array.from(bucket.values()).filter((x) => x.value > 0);
      const total = arr.reduce((s, x) => s + x.value, 0);
      return {
        totalValue: total,
        items: arr
          .map((x) => ({
            label: x.label,
            value: x.value,
            percentage: total > 0 ? (x.value / total) * 100 : 0,
          }))
          .sort((a, b) => b.value - a.value),
      };
    };

    return {
      food: toDonut(buckets.FOOD),
      papiers: toDonut(buckets.PAPIERS),
      nettoyage: toDonut(buckets.NETTOYAGE),
    };
  }

  /**
   * Products whose closing inventory count fell below their min stock.
   * Renamed from "critical" to "watch" so the UI doesn't suggest a
   * real-time signal we don't actually have.
   */
  async getWatchProducts(periodId?: string, branchId?: string) {
    const period = await this.resolvePeriod(periodId, branchId);
    if (!period) return [];

    const lines = await this.prisma.inventoryLine.findMany({
      where: { periodId: period.id },
      include: { product: true },
    });

    return lines
      .filter((l) => {
        if (!l.product.minStockLevel.gt(0)) return false;
        const ref = l.closingQuantity.gt(0) ? l.closingQuantity : l.openingQuantity;
        return ref.lt(l.product.minStockLevel);
      })
      .map((l) => {
        const ref = l.closingQuantity.gt(0) ? l.closingQuantity : l.openingQuantity;
        return {
          productId: l.productId,
          productName: l.product.name,
          unit: l.product.unit,
          closingQuantity: ref.toNumber(),
          minStockLevel: l.product.minStockLevel.toNumber(),
        };
      });
  }

  /**
   * Returns a richer summary block for the V2 dashboard:
   *   activePeriod, openingValue, purchasesValue, closingValue, realCost,
   *   salesRevenue, foodCostPercentage, purchasesCount, topSupplier,
   *   reportStatus
   * `reportStatus` reflects whether the figures are a live preview from the
   * open period or the reconciled report of a closed period.
   */
  async getSummaryV2(periodId?: string, branchId?: string) {
    const period = await this.resolvePeriod(periodId, branchId);
    if (!period) {
      return {
        activePeriod: null,
        openingValue: 0,
        purchasesValue: 0,
        closingValue: 0,
        realCost: 0,
        salesRevenue: null as number | null,
        foodCostPercentage: null as number | null,
        purchasesCount: 0,
        topSupplier: null as { id: string; name: string; totalAmount: number } | null,
        reportStatus: 'OPEN_PREVIEW' as 'OPEN_PREVIEW' | 'CLOSED_OFFICIAL',
      };
    }

    const snap = await this.computeSnapshot(period);
    const start = monthStartUTC(period.year, period.month);
    const end = monthEndExclusiveUTC(period.year, period.month);

    const [countAgg, perSupplier] = await Promise.all([
      this.prisma.purchase.count({
        where: {
          branchId: period.branchId,
          purchaseDate: { gte: start, lt: end },
        },
      }),
      this.prisma.purchase.groupBy({
        by: ['supplierId'],
        where: {
          branchId: period.branchId,
          purchaseDate: { gte: start, lt: end },
        },
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 1,
      }),
    ]);

    let topSupplier: { id: string; name: string; totalAmount: number } | null = null;
    if (perSupplier.length > 0) {
      const top = perSupplier[0]!;
      const s = await this.prisma.supplier.findUnique({
        where: { id: top.supplierId },
        select: { id: true, name: true },
      });
      if (s) {
        topSupplier = {
          id: s.id,
          name: s.name,
          totalAmount: top._sum.totalAmount?.toNumber() ?? 0,
        };
      }
    }

    return {
      activePeriod: {
        id: period.id,
        month: period.month,
        year: period.year,
        status: period.status,
      },
      openingValue: snap.openingValue,
      purchasesValue: snap.purchasesValue,
      closingValue: snap.closingValue,
      realCost: snap.realCost,
      salesRevenue: snap.salesRevenue,
      foodCostPercentage: snap.foodCostPercentage,
      purchasesCount: countAgg,
      topSupplier,
      reportStatus:
        period.status === PeriodStatus.CLOSED
          ? ('CLOSED_OFFICIAL' as const)
          : ('OPEN_PREVIEW' as const),
    };
  }
}
