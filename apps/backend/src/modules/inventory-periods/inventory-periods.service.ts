import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryPeriod, PeriodStatus, Prisma } from '@prisma/client';
import {
  CostFamily,
  canBypassClosedPeriod,
  categoryTypeToBucket,
} from '@inventorymdb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePeriodDto } from './dto/create-period.dto';
import { ClosePeriodDto } from './dto/close-period.dto';
import { BootstrapPeriodDto } from './dto/bootstrap-period.dto';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  resolveBranchScope,
  resolveBranchForMutation,
} from '../../common/helpers/branch-scope.helper';
import {
  monthStartUTC,
  monthEndExclusiveUTC,
} from '../../common/helpers/business-date.helper';
import { computeConsumptionQuantity } from '../../common/helpers/inventory-math.helper';

interface PeriodWithReport extends InventoryPeriod {
  report?: {
    id: string;
    periodId: string;
    openingValue: Prisma.Decimal;
    purchasesValue: Prisma.Decimal;
    closingValue: Prisma.Decimal;
    realCost: Prisma.Decimal;
    foodCost: Prisma.Decimal;
    paperCost: Prisma.Decimal;
    cleaningCost: Prisma.Decimal;
    salesRevenue: Prisma.Decimal | null;
    foodCostPercentage: Prisma.Decimal | null;
    generatedAt: Date;
  } | null;
}

@Injectable()
export class InventoryPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Live aggregation helpers
  // -------------------------------------------------------------------

  /**
   * Computes the live (non-persisted) aggregates for a given period:
   * openingValue, closingValue, purchasesValue, realCost, plus row counts
   * (linesCount + criticalProductsCount).
   *
   * - openingValue / closingValue are derived from inventoryLine columns.
   * - purchasesValue comes from non-cancelled purchases on the calendar month.
   * - realCost = opening + purchases âˆ’ closing (always).
   *
   * Persisted report.foodCostPercentage / salesRevenue are surfaced when
   * the period is CLOSED (otherwise the values are null on the wire).
   */
  private async computeAggregates(period: PeriodWithReport) {
    const start = monthStartUTC(period.year, period.month);
    const end = monthEndExclusiveUTC(period.year, period.month);

    const [lines, purchaseItems] = await Promise.all([
      this.prisma.inventoryLine.findMany({
        where: { periodId: period.id },
        select: {
          productId: true,
          openingQuantity: true,
          openingUnitCost: true,
          closingQuantity: true,
          closingUnitCost: true,
          product: {
            select: {
              minStockLevel: true,
              defaultCost: true,
              // Pour ventiler les agrégats live (DRAFT) dans le bon
              // bucket Food / Paper / Cleaning.
              category: { select: { categoryType: true } },
            },
          },
        },
      }),
      // Per-product purchase aggregation for weighted-average cost.
      this.prisma.purchaseItem.groupBy({
        by: ['productId'],
        where: {
          purchase: {
            branchId: period.branchId,
            purchaseDate: { gte: start, lt: end },
          },
        },
        _sum: { quantity: true, totalPrice: true },
      }),
    ]);

    // productId → { qty, value } from purchases of the calendar month.
    const purchasesByProduct = new Map(
      purchaseItems.map((row) => [
        row.productId,
        {
          qty: row._sum.quantity ?? new Prisma.Decimal(0),
          value: row._sum.totalPrice ?? new Prisma.Decimal(0),
        },
      ]),
    );

    let openingValue = new Prisma.Decimal(0);
    let closingValue = new Prisma.Decimal(0);
    let purchasesValue = new Prisma.Decimal(0);
    let criticalCount = 0;

    // Live ventilation. CLOSED periods read the persisted bucket fields
    // directly in `serialize` — these accumulators only matter for OPEN.
    const bucket: Record<CostFamily, {
      opening: Prisma.Decimal;
      purchases: Prisma.Decimal;
      closing: Prisma.Decimal;
    }> = {
      FOOD: { opening: new Prisma.Decimal(0), purchases: new Prisma.Decimal(0), closing: new Prisma.Decimal(0) },
      PAPER: { opening: new Prisma.Decimal(0), purchases: new Prisma.Decimal(0), closing: new Prisma.Decimal(0) },
      CLEANING: { opening: new Prisma.Decimal(0), purchases: new Prisma.Decimal(0), closing: new Prisma.Decimal(0) },
    };

    for (const l of lines) {
      const p = purchasesByProduct.get(l.productId);

      // Fallback chain: WAC → previous snapshot → defaultCost. For CLOSED
      // periods we use the stored snapshot directly (closingUnitCost), so
      // historical aggregates stay stable.
      let unitCost: Prisma.Decimal;
      if (period.status === PeriodStatus.CLOSED) {
        unitCost = !l.closingUnitCost.isZero()
          ? l.closingUnitCost
          : !l.openingUnitCost.isZero()
            ? l.openingUnitCost
            : l.product.defaultCost;
      } else if (p && p.qty.gt(0)) {
        unitCost = p.value.div(p.qty);
      } else if (!l.closingUnitCost.isZero()) {
        unitCost = l.closingUnitCost;
      } else if (!l.openingUnitCost.isZero()) {
        unitCost = l.openingUnitCost;
      } else {
        unitCost = l.product.defaultCost;
      }

      const openLineValue = l.openingQuantity.mul(unitCost);
      const closeLineValue = l.closingQuantity.mul(unitCost);
      openingValue = openingValue.plus(openLineValue);
      closingValue = closingValue.plus(closeLineValue);
      if (p) purchasesValue = purchasesValue.plus(p.value);

      const fam = categoryTypeToBucket(
        l.product.category?.categoryType ?? null,
      );
      bucket[fam].opening = bucket[fam].opening.plus(openLineValue);
      bucket[fam].closing = bucket[fam].closing.plus(closeLineValue);
      if (p) bucket[fam].purchases = bucket[fam].purchases.plus(p.value);

      const minStock = l.product.minStockLevel;
      if (minStock.gt(0) && l.closingQuantity.lt(minStock)) {
        criticalCount += 1;
      }
    }

    const realCost = openingValue.plus(purchasesValue).minus(closingValue);
    const foodCost = bucket.FOOD.opening.plus(bucket.FOOD.purchases).minus(bucket.FOOD.closing);
    const paperCost = bucket.PAPER.opening.plus(bucket.PAPER.purchases).minus(bucket.PAPER.closing);
    const cleaningCost = bucket.CLEANING.opening.plus(bucket.CLEANING.purchases).minus(bucket.CLEANING.closing);

    return {
      openingValue,
      purchasesValue,
      closingValue,
      realCost,
      foodCost,
      paperCost,
      cleaningCost,
      linesCount: lines.length,
      criticalProductsCount: criticalCount,
    };
  }

  private async serialize(period: PeriodWithReport) {
    const agg = await this.computeAggregates(period);
    // CLOSED periods MUST surface their persisted ventilation (snapshot
    // historique figé). OPEN periods utilisent les buckets live calculés
    // par `computeAggregates`. Le choix est explicite ici.
    const useStored = period.status === PeriodStatus.CLOSED && period.report;
    const foodCost = useStored ? period.report!.foodCost : agg.foodCost;
    const paperCost = useStored ? period.report!.paperCost : agg.paperCost;
    const cleaningCost = useStored ? period.report!.cleaningCost : agg.cleaningCost;
    return {
      id: period.id,
      branchId: period.branchId,
      month: period.month,
      year: period.year,
      status: period.status,
      openingDate: period.openingDate?.toISOString() ?? null,
      closingDate: period.closingDate?.toISOString() ?? null,
      createdAt: period.createdAt.toISOString(),
      updatedAt: period.updatedAt.toISOString(),
      openingValue: agg.openingValue.toString(),
      purchasesValue: agg.purchasesValue.toString(),
      closingValue: agg.closingValue.toString(),
      realCost: agg.realCost.toString(),
      foodCost: foodCost.toString(),
      paperCost: paperCost.toString(),
      cleaningCost: cleaningCost.toString(),
      salesRevenue: period.report?.salesRevenue?.toString() ?? null,
      foodCostPercentage: period.report?.foodCostPercentage?.toString() ?? null,
      linesCount: agg.linesCount,
      criticalProductsCount: agg.criticalProductsCount,
      report: period.report
        ? {
            id: period.report.id,
            periodId: period.report.periodId,
            openingValue: period.report.openingValue.toString(),
            purchasesValue: period.report.purchasesValue.toString(),
            closingValue: period.report.closingValue.toString(),
            realCost: period.report.realCost.toString(),
            foodCost: period.report.foodCost.toString(),
            paperCost: period.report.paperCost.toString(),
            cleaningCost: period.report.cleaningCost.toString(),
            salesRevenue: period.report.salesRevenue?.toString() ?? null,
            foodCostPercentage: period.report.foodCostPercentage?.toString() ?? null,
            generatedAt: period.report.generatedAt.toISOString(),
          }
        : null,
    };
  }

  // -------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------

  async findAll(
    status?: PeriodStatus,
    user?: RequestUser,
    branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const where: Prisma.InventoryPeriodWhereInput = {
      ...(status ? { status } : {}),
      ...(scope ? { branchId: scope } : {}),
    };
    const rows = await this.prisma.inventoryPeriod.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { report: true },
    });
    return Promise.all(rows.map((p) => this.serialize(p)));
  }

  async findOne(id: string) {
    const p = await this.prisma.inventoryPeriod.findUnique({
      where: { id },
      include: { report: true },
    });
    if (!p) throw new NotFoundException('Période introuvable');
    return this.serialize(p);
  }

  /** Raw record (no live aggregates) â€” used internally by close(). */
  async findOneRaw(id: string) {
    const p = await this.prisma.inventoryPeriod.findUnique({
      where: { id },
      include: { report: true },
    });
    if (!p) throw new NotFoundException('Période introuvable');
    return p;
  }

  async findCurrent(user?: RequestUser, branchId?: string) {
    const scope = resolveBranchScope(user, branchId);
    const open = await this.prisma.inventoryPeriod.findFirst({
      where: { status: PeriodStatus.OPEN, ...(scope ? { branchId: scope } : {}) },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { report: true },
    });
    return open ? this.serialize(open) : null;
  }

  async summary(user?: RequestUser, branchId?: string) {
    const scope = resolveBranchScope(user, branchId);
    const scopeWhere: Prisma.InventoryPeriodWhereInput = scope ? { branchId: scope } : {};
    const [open, lastClosed] = await Promise.all([
      this.prisma.inventoryPeriod.findFirst({
        where: { status: PeriodStatus.OPEN, ...scopeWhere },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        include: { report: true },
      }),
      this.prisma.inventoryPeriod.findFirst({
        where: { status: PeriodStatus.CLOSED, ...scopeWhere },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        include: { report: true },
      }),
    ]);

    const openSerialized = open ? await this.serialize(open) : null;
    const closedSerialized = lastClosed ? await this.serialize(lastClosed) : null;

    return {
      openPeriod: openSerialized,
      lastClosedPeriod: closedSerialized,
      criticalProductsCount: openSerialized?.criticalProductsCount ?? 0,
      openMonthPurchases: openSerialized?.purchasesValue ?? '0',
    };
  }

  // -------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------

  async bootstrap(dto: BootstrapPeriodDto, user?: RequestUser) {
    const branchId = resolveBranchForMutation(user, dto.branchId);
    const existing = await this.prisma.inventoryPeriod.findFirst({
      where: { branchId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        "L'inventaire de cette succursale a déjà été initialisé.",
      );
    }

    const now = new Date();
    const month = dto.month ?? now.getMonth() + 1;
    const year = dto.year ?? now.getFullYear();

    const created = await this.prisma.$transaction(async (tx) => {
      const period = await tx.inventoryPeriod.create({
        data: {
          branchId,
          year,
          month,
          status: PeriodStatus.OPEN,
          openingDate: monthStartUTC(year, month),
        },
      });
      await this.seedLinesForActiveProducts(tx, period.id, branchId);
      return tx.inventoryPeriod.findUniqueOrThrow({
        where: { id: period.id },
        include: { report: true },
      });
    });
    return this.serialize(created);
  }

  /**
   * Creates `InventoryLine` rows (opening 0, closing 0) for every active
   * product on `branchId` that doesn't already have one in `periodId`.
   *
   * Idempotent — safe to call after a closing→opening copy loop, to pick up
   * products created mid-month that never received a line in the closed period.
   * Returns the number of rows actually inserted.
   */
  private async seedLinesForActiveProducts(
    tx: Prisma.TransactionClient,
    periodId: string,
    branchId: string,
  ): Promise<number> {
    const activeProducts = await tx.inventoryProduct.findMany({
      where: { branchId, isActive: true },
      select: { id: true, defaultCost: true },
    });
    if (activeProducts.length === 0) return 0;

    const existing = await tx.inventoryLine.findMany({
      where: { periodId },
      select: { productId: true },
    });
    const existingIds = new Set(existing.map((l) => l.productId));

    // Snapshot Product.defaultCost into both opening and closing unit cost
    // columns at line-creation time. The user only enters closingQuantity in
    // the UI; the cost stays as captured here so historical inventories don't
    // shift retroactively when the product's defaultCost is later edited.
    const toCreate = activeProducts
      .filter((p) => !existingIds.has(p.id))
      .map((p) => ({
        periodId,
        productId: p.id,
        openingUnitCost: p.defaultCost,
        closingUnitCost: p.defaultCost,
      }));
    if (toCreate.length === 0) return 0;

    const result = await tx.inventoryLine.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
    return result.count;
  }

  async create(dto: CreatePeriodDto, user?: RequestUser) {
    const branchId = resolveBranchForMutation(user, dto.branchId);
    const exists = await this.prisma.inventoryPeriod.findUnique({
      where: { branchId_year_month: { branchId, year: dto.year, month: dto.month } },
    });
    if (exists) throw new ConflictException('Cette période existe déjà pour cette branche');

    const created = await this.prisma.$transaction(async (tx) => {
      const period = await tx.inventoryPeriod.create({
        data: {
          branchId,
          year: dto.year,
          month: dto.month,
          status: PeriodStatus.OPEN,
          openingDate: dto.openingDate ?? monthStartUTC(dto.year, dto.month),
        },
      });
      // Even on manual create (admin override), seed lines so the user is not
      // dropped onto an empty grid.
      await this.seedLinesForActiveProducts(tx, period.id, branchId);
      return tx.inventoryPeriod.findUniqueOrThrow({
        where: { id: period.id },
        include: { report: true },
      });
    });
    return this.serialize(created);
  }

  async ensureMutable(id: string, user: RequestUser) {
    const period = await this.findOneRaw(id);
    if (period.status === PeriodStatus.CLOSED && !canBypassClosedPeriod(user.role)) {
      throw new ForbiddenException(
        'Période clôturée : seul un OWNER ou ADMIN peut modifier',
      );
    }
    return period;
  }

  /**
   * Closes a period:
   *  - aggregates non-cancelled purchase items into each inventory line
   *  - computes consumption per line: opening + purchases âˆ’ closing
   *  - generates the InventoryReport (with optional foodCost %)
   *  - flips status to CLOSED
   *  - creates next month period and copies closingQuantity â†’ openingQuantity
   */
  async close(id: string, dto: ClosePeriodDto) {
    const period = await this.findOneRaw(id);
    if (period.status === PeriodStatus.CLOSED) {
      throw new BadRequestException('Période déjà clôturée');
    }

    // Long transaction: aggregate purchases, update N lines, upsert report,
    // create next period, upsert N opening lines, seed new products. With a
    // large catalog this routinely exceeds Prisma's 5s default — bump the
    // timeout (and maxWait, the queue time before the tx actually starts).
    await this.prisma.$transaction(async (tx) => {
      const start = monthStartUTC(period.year, period.month);
      const end = monthEndExclusiveUTC(period.year, period.month);

      const purchaseItems = await tx.purchaseItem.findMany({
        where: {
          purchase: {
            purchaseDate: { gte: start, lt: end },
          },
        },
      });

      const purchasesByProduct = new Map<string, { qty: Prisma.Decimal; value: Prisma.Decimal }>();
      for (const it of purchaseItems) {
        const cur = purchasesByProduct.get(it.productId) ?? {
          qty: new Prisma.Decimal(0),
          value: new Prisma.Decimal(0),
        };
        cur.qty = cur.qty.plus(it.quantity);
        cur.value = cur.value.plus(it.totalPrice);
        purchasesByProduct.set(it.productId, cur);
      }

      const lines = await tx.inventoryLine.findMany({ where: { periodId: id } });
      let openingValue = new Prisma.Decimal(0);
      let purchasesValue = new Prisma.Decimal(0);
      let closingValue = new Prisma.Decimal(0);

      // V4 ventilation : on accumule séparément Food / Paper / Cleaning.
      // Le bucket par produit est résolu via la catégorie (mapping fait
      // dans `categoryTypeToBucket` côté shared). Le total realCost reste
      // = food + paper + cleaning (invariant maintenu).
      const bucketAccum: Record<CostFamily, {
        opening: Prisma.Decimal;
        purchases: Prisma.Decimal;
        closing: Prisma.Decimal;
      }> = {
        FOOD: {
          opening: new Prisma.Decimal(0),
          purchases: new Prisma.Decimal(0),
          closing: new Prisma.Decimal(0),
        },
        PAPER: {
          opening: new Prisma.Decimal(0),
          purchases: new Prisma.Decimal(0),
          closing: new Prisma.Decimal(0),
        },
        CLEANING: {
          opening: new Prisma.Decimal(0),
          purchases: new Prisma.Decimal(0),
          closing: new Prisma.Decimal(0),
        },
      };

      // We also need each product's defaultCost to fall back on when the
      // line has no purchases AND no previous-period snapshot. Pulled in one
      // shot to avoid N+1. `categoryType` est aussi joint maintenant pour
      // ventiler le coût dans le bon bucket (Food/Paper/Cleaning).
      const productMeta = await tx.inventoryProduct.findMany({
        where: { id: { in: lines.map((l) => l.productId) } },
        select: {
          id: true,
          defaultCost: true,
          category: { select: { categoryType: true } },
        },
      });
      const defaultCostByProduct = new Map(
        productMeta.map((p) => [p.id, p.defaultCost]),
      );
      const bucketByProduct = new Map<string, CostFamily>(
        productMeta.map((p) => [
          p.id,
          categoryTypeToBucket(p.category?.categoryType ?? null),
        ]),
      );

      // Compute totals + per-line update payloads in memory, then fire all
      // updates in parallel so Prisma can pipeline them on the tx connection.
      //
      // V3 weighted-average cost: at close time we snapshot the period's
      // WAC as the line's `closingUnitCost` (= openingUnitCost so both
      // columns stay in sync). All value computations use this single cost.
      // This is the frozen snapshot — once CLOSED, this value never changes
      // again, even if someone backdates a purchase to the month later.
      const updates: Promise<unknown>[] = [];
      for (const line of lines) {
        const p = purchasesByProduct.get(line.productId) ?? {
          qty: new Prisma.Decimal(0),
          value: new Prisma.Decimal(0),
        };

        // Fallback chain: WAC → previous snapshot → default cost → 0.
        let unitCost: Prisma.Decimal;
        if (p.qty.gt(0)) {
          unitCost = p.value.div(p.qty);
        } else if (!line.closingUnitCost.isZero()) {
          unitCost = line.closingUnitCost;
        } else if (!line.openingUnitCost.isZero()) {
          unitCost = line.openingUnitCost;
        } else {
          unitCost = defaultCostByProduct.get(line.productId) ?? new Prisma.Decimal(0);
        }

        const openLineValue = line.openingQuantity.mul(unitCost);
        const closeLineValue = line.closingQuantity.mul(unitCost);
        const consumptionQty = computeConsumptionQuantity({
          opening: line.openingQuantity,
          purchases: p.qty,
          transferIn: line.transferInQuantity,
          transferOut: line.transferOutQuantity,
          closing: line.closingQuantity,
        });
        const consumptionVal = openLineValue.plus(p.value).minus(closeLineValue);

        updates.push(
          tx.inventoryLine.update({
            where: { id: line.id },
            data: {
              purchasesQuantity: p.qty,
              purchasesValue: p.value,
              consumptionQuantity: consumptionQty,
              consumptionValue: consumptionVal,
              // Snapshot the WAC into both cost columns so historical reads
              // always return the right number.
              openingUnitCost: unitCost,
              closingUnitCost: unitCost,
            },
          }),
        );

        openingValue = openingValue.plus(openLineValue);
        purchasesValue = purchasesValue.plus(p.value);
        closingValue = closingValue.plus(closeLineValue);

        // Accumulate into the line's cost-family bucket. Default to PAPER
        // for any product whose category is missing or still tagged
        // NON_FOOD (legacy) — same rule as `categoryTypeToBucket`.
        const bucket = bucketByProduct.get(line.productId) ?? CostFamily.PAPER;
        const acc = bucketAccum[bucket];
        acc.opening = acc.opening.plus(openLineValue);
        acc.purchases = acc.purchases.plus(p.value);
        acc.closing = acc.closing.plus(closeLineValue);
      }
      await Promise.all(updates);

      const realCost = openingValue.plus(purchasesValue).minus(closingValue);
      const foodCost = bucketAccum.FOOD.opening
        .plus(bucketAccum.FOOD.purchases)
        .minus(bucketAccum.FOOD.closing);
      const paperCost = bucketAccum.PAPER.opening
        .plus(bucketAccum.PAPER.purchases)
        .minus(bucketAccum.PAPER.closing);
      const cleaningCost = bucketAccum.CLEANING.opening
        .plus(bucketAccum.CLEANING.purchases)
        .minus(bucketAccum.CLEANING.closing);
      const sales =
        dto.salesRevenue !== undefined && dto.salesRevenue !== null
          ? new Prisma.Decimal(dto.salesRevenue)
          : null;
      const foodCostPct = sales && sales.gt(0) ? realCost.div(sales).mul(100) : null;

      await tx.inventoryReport.upsert({
        where: { periodId: id },
        create: {
          periodId: id,
          openingValue,
          purchasesValue,
          closingValue,
          realCost,
          foodCost,
          paperCost,
          cleaningCost,
          salesRevenue: sales ?? undefined,
          foodCostPercentage: foodCostPct ?? undefined,
        },
        update: {
          openingValue,
          purchasesValue,
          closingValue,
          realCost,
          foodCost,
          paperCost,
          cleaningCost,
          salesRevenue: sales ?? undefined,
          foodCostPercentage: foodCostPct ?? undefined,
          generatedAt: new Date(),
        },
      });

      await tx.inventoryPeriod.update({
        where: { id },
        data: {
          status: PeriodStatus.CLOSED,
          closingDate: dto.closingDate ?? new Date(),
        },
      });

      const nextMonth = period.month === 12 ? 1 : period.month + 1;
      const nextYear = period.month === 12 ? period.year + 1 : period.year;
      const nextOpening = new Date(nextYear, nextMonth - 1, 1);

      const next = await tx.inventoryPeriod.upsert({
        where: {
          branchId_year_month: {
            branchId: period.branchId,
            year: nextYear,
            month: nextMonth,
          },
        },
        create: {
          branchId: period.branchId,
          year: nextYear,
          month: nextMonth,
          status: PeriodStatus.OPEN,
          openingDate: nextOpening,
        },
        update: {},
      });

      await Promise.all(
        lines.map((line) =>
          tx.inventoryLine.upsert({
            where: { periodId_productId: { periodId: next.id, productId: line.productId } },
            create: {
              periodId: next.id,
              productId: line.productId,
              openingQuantity: line.closingQuantity,
              openingUnitCost: line.closingUnitCost,
              // Carry the cost snapshot forward to BOTH columns so the new
              // period's "Prix u." column isn't 0 the moment it's opened.
              // The user can still change it indirectly (via Product.defaultCost
              // edits + the ensure helper), but the default is the previous
              // month's closing value.
              closingUnitCost: line.closingUnitCost,
              transferInQuantity: 0,
              transferOutQuantity: 0,
            },
            update: {
              openingQuantity: line.closingQuantity,
              openingUnitCost: line.closingUnitCost,
              // Don't overwrite an existing closingUnitCost on update — it may
              // already hold a user edit on N+1.
              transferInQuantity: 0,
              transferOutQuantity: 0,
            },
          }),
        ),
      );

      // Pick up products activated mid-month — they had no line in the closed
      // period, so the copy loop above skipped them. Seed them with opening=0.
      await this.seedLinesForActiveProducts(tx, next.id, period.branchId);
    }, { timeout: 30_000, maxWait: 10_000 });

    return this.findOne(id);
  }

  /**
   * Réouvre une période CLOSED — passe status à OPEN. Ne touche RIEN
   * d'autre : InventoryLine, quantities (opening/closing), notes, produits
   * sont tous conservés à l'identique. Le snapshot InventoryReport n'est
   * pas supprimé — il reste pointer sur les chiffres du dernier close.
   * La ré-agrégation live prendra le relais tant que la période reste OPEN,
   * et le prochain close() écrasera le snapshot avec les nouveaux totaux.
   *
   * Règles :
   *  - Seul OWNER/ADMIN peut réouvrir (permission BYPASS_CLOSED_PERIOD).
   *  - La période doit être CLOSED (sinon 400).
   *  - Si un rapport financier LOCKED existe pour ce mois, on ne le
   *    modifie PAS mais on remonte l'info au frontend pour le warning.
   *  - Le module Purchases utilise déjà `assertPeriodEditable` — dès que
   *    status = OPEN, les Managers peuvent à nouveau ajouter des achats
   *    rétroactifs sans 403.
   *
   * IMPORTANT : ce endpoint est intentionnellement idempotent-safe. Un
   * second appel après réouverture retournera 400 « Période déjà OPEN »,
   * il n'y a pas d'état intermédiaire à gérer.
   */
  async reopen(id: string, user: RequestUser) {
    const period = await this.findOneRaw(id);
    if (period.status === PeriodStatus.OPEN) {
      throw new BadRequestException('Période déjà ouverte');
    }
    // Défense en profondeur : le contrôleur applique déjà la permission,
    // mais on re-vérifie ici (les futures intégrations non-HTTP pourraient
    // court-circuiter la couche décorateur).
    if (!canBypassClosedPeriod(user.role)) {
      throw new ForbiddenException(
        'Seul un OWNER ou ADMIN peut réouvrir une période clôturée.',
      );
    }

    // Info à remonter au frontend pour le warning « FR LOCKED ». La
    // requête est intentionnellement DÉCORRÉLÉE de la réouverture : on
    // laisse le rapport verrouillé tel quel, l'utilisateur devra le
    // déverrouiller manuellement s'il veut qu'il reflète les nouveaux
    // chiffres.
    const linkedLockedReport = await this.prisma.financialReport.findUnique({
      where: {
        branchId_year_month: {
          branchId: period.branchId,
          year: period.year,
          month: period.month,
        },
      },
      select: { id: true, status: true },
    });
    const lockedReportWarning =
      linkedLockedReport?.status === 'LOCKED'
        ? {
            id: linkedLockedReport.id,
            message:
              `Le rapport financier de ${period.month}/${period.year} est verrouillé — ` +
              `ses chiffres restent figés. Déverrouillez-le manuellement si vous souhaitez ` +
              `qu'il reflète les nouveaux totaux après re-clôture.`,
          }
        : null;

    await this.prisma.inventoryPeriod.update({
      where: { id },
      data: {
        status: PeriodStatus.OPEN,
        // closingDate reste tel quel — c'est un souvenir de quand la
        // période avait été clôturée, utile pour un audit visuel.
        // Un futur close() écrasera cette date automatiquement.
      },
    });

    // Renvoie la période mise à jour + le warning éventuel.
    const refreshed = await this.findOne(id);
    return { period: refreshed, lockedReportWarning };
  }
}
