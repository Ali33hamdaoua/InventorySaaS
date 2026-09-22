import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PeriodStatus, Prisma } from '@prisma/client';
import {
  CostFamily,
  canBypassClosedPeriod,
  categoryTypeToBucket,
} from '@inventorymdb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BulkLinesDto, UpsertLineDto } from './dto/upsert-line.dto';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { monthStartUTC, monthEndExclusiveUTC } from '../../common/helpers/business-date.helper';
import { computeConsumptionQuantity, computeAvailableQuantity } from '../../common/helpers/inventory-math.helper';

@Injectable()
export class InventoryLinesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns inventory lines for a period, enriched with:
   *  - live purchasesQuantity / purchasesValue (aggregated from non-cancelled
   *    PurchaseItems on the period's calendar month — useful while the
   *    period is still OPEN since the persisted columns are 0 until close)
   *  - live consumption preview (opening + purchases − closing)
   *  - product + category + isCritical flag.
   *
   * Decimals are serialized as strings on the wire to dodge the global
   * ClassSerializerInterceptor (avoids `NaN` on the frontend).
   */
  async findByPeriod(periodId: string) {
    const period = await this.prisma.inventoryPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Période introuvable');

    // Backfill lines for any active product that doesn't yet have one (e.g.
    // products created AFTER bootstrap), and refresh unit costs that were
    // stored as 0 if the product now has a defaultCost > 0. Cheap to run on
    // each page load — typically 0 writes when nothing changed.
    if (period.status !== PeriodStatus.CLOSED) {
      await this.ensureInventoryLinesForPeriod(periodId);
    }

    const start = monthStartUTC(period.year, period.month);
    const end = monthEndExclusiveUTC(period.year, period.month);

    const [lines, purchaseItems] = await Promise.all([
      this.prisma.inventoryLine.findMany({
        where: { periodId },
        include: {
          product: {
            include: {
              category: { select: { id: true, name: true, categoryType: true } },
            },
          },
        },
        orderBy: [{ product: { category: { name: 'asc' } } }, { product: { name: 'asc' } }],
      }),
      this.prisma.purchaseItem.findMany({
        where: {
          // Defensive: scope to the period's branch so a productId collision
          // across branches (shouldn't happen, but be safe) doesn't leak.
          purchase: {
            branchId: period.branchId,
            purchaseDate: { gte: start, lt: end },
          },
        },
        select: { productId: true, quantity: true, totalPrice: true },
      }),
    ]);

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

    return lines.map((l) => {
      const p = purchasesByProduct.get(l.productId) ?? {
        qty: new Prisma.Decimal(0),
        value: new Prisma.Decimal(0),
      };

      // For OPEN periods, surface the live aggregation so users see real-time
      // totals; for CLOSED periods, return persisted reconciled values.
      const purchasesQuantity = period.status === PeriodStatus.OPEN ? p.qty : l.purchasesQuantity;
      const purchasesValue = period.status === PeriodStatus.OPEN ? p.value : l.purchasesValue;

      // Weighted average cost for this period:
      //   wac = Σ(qty × unitPrice) / Σ(qty)  across all PurchaseItems of the
      //         product in the period's calendar month, scoped to the branch.
      //
      // Fallback chain (per client spec):
      //   1. period purchases WAC (live for OPEN, persisted for CLOSED)
      //   2. line.closingUnitCost — carries the previous period's snapshot
      //   3. line.openingUnitCost — same value in practice (close() copies)
      //   4. Product.defaultCost — last resort
      //
      // CLOSED periods always use the persisted `closingUnitCost` snapshot
      // (= the WAC at close time) so the historical view never shifts when
      // someone backdates a purchase to that month.
      const computeUnitCost = (): Prisma.Decimal => {
        if (period.status === PeriodStatus.CLOSED) {
          // Snapshot wins — but if it's somehow zero, fall back gracefully.
          if (!l.closingUnitCost.isZero()) return l.closingUnitCost;
          if (!l.openingUnitCost.isZero()) return l.openingUnitCost;
          return l.product.defaultCost;
        }
        const livePurchases = purchasesByProduct.get(l.productId);
        if (livePurchases && livePurchases.qty.gt(0)) {
          return livePurchases.value.div(livePurchases.qty);
        }
        if (!l.closingUnitCost.isZero()) return l.closingUnitCost;
        if (!l.openingUnitCost.isZero()) return l.openingUnitCost;
        return l.product.defaultCost;
      };
      const unitCost = computeUnitCost();

      // Per client spec, ALL value computations use the single per-period
      // unit cost (WAC). Opening / closing / consumption all share it.
      const closingQty = l.closingQuantity;
      let consumptionQuantity = l.consumptionQuantity;
      let consumptionValue = l.consumptionValue;
      if (period.status === PeriodStatus.OPEN) {
        consumptionQuantity = computeConsumptionQuantity({
          opening: l.openingQuantity,
          purchases: p.qty,
          transferIn: l.transferInQuantity,
          transferOut: l.transferOutQuantity,
          closing: closingQty,
        });
        const openVal = l.openingQuantity.mul(unitCost);
        const closeVal = closingQty.mul(unitCost);
        // Note: valuation (consumptionValue) does not yet factor in transfers (V1)
        consumptionValue = openVal.plus(p.value).minus(closeVal);
      }

      const minStock = l.product.minStockLevel;
      const isCritical = minStock.gt(0) && closingQty.lt(minStock);

      const availableQuantity = computeAvailableQuantity({
        opening: l.openingQuantity,
        purchases: p.qty,
        transferIn: l.transferInQuantity,
        transferOut: l.transferOutQuantity,
      });

      return {
        id: l.id,
        periodId: l.periodId,
        productId: l.productId,
        openingQuantity: l.openingQuantity.toString(),
        openingUnitCost: l.openingUnitCost.toString(),
        closingQuantity: closingQty.toString(),
        closingUnitCost: l.closingUnitCost.toString(),
        // V3 weighted-average cost — single source of truth for display +
        // valuations. Frontend should read THIS, not the legacy
        // opening/closing columns (kept on the wire for backward compat).
        unitCost: unitCost.toString(),
        purchasesQuantity: purchasesQuantity.toString(),
        purchasesValue: purchasesValue.toString(),
        transferInQuantity: l.transferInQuantity.toString(),
        transferOutQuantity: l.transferOutQuantity.toString(),
        availableQuantity: availableQuantity.toString(),
        consumptionQuantity: consumptionQuantity.toString(),
        consumptionValue: consumptionValue.toString(),
        product: {
          id: l.product.id,
          // Source de verite pour la succursale d'origine d'un transfert :
          // l'UI n'a plus besoin d'attendre le chargement de la periode.
          branchId: l.product.branchId,
          name: l.product.name,
          unit: l.product.unit,
          minStockLevel: l.product.minStockLevel.toString(),
          categoryId: l.product.categoryId,
          category: l.product.category
            ? {
                id: l.product.category.id,
                name: l.product.category.name,
                categoryType: l.product.category.categoryType,
              }
            : null,
          isActive: l.product.isActive,
          // Packaging OPTIONNEL — passthrough purement descriptif.
          // Aucun calcul métier ne consomme ces champs côté backend.
          packagingName: l.product.packagingName,
          packagingFactor: l.product.packagingFactor?.toString() ?? null,
        },
        isCritical,
      };
    });
  }

  /**
   * Idempotent backfill of inventory lines for a period:
   *   - Creates a line for every active product on the branch that doesn't
   *     already have one. New lines snapshot `Product.defaultCost` into both
   *     `openingUnitCost` and `closingUnitCost`.
   *   - Refreshes existing lines whose `openingUnitCost` OR `closingUnitCost`
   *     is 0 but the product now has a non-zero `defaultCost` — without
   *     touching quantities. This rescues lines created before the user set
   *     a price, or before close() carried the cost forward properly.
   *
   * Quantities (opening/closing) are never overwritten — user input is sacred.
   *
   * Returns counts for diagnostics. Safe to call inside or outside a tx.
   */
  async ensureInventoryLinesForPeriod(
    periodId: string,
    txParam?: Prisma.TransactionClient,
  ): Promise<{ created: number; refreshed: number }> {
    const exec = (txParam ?? this.prisma) as Prisma.TransactionClient;
    const period = await exec.inventoryPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, branchId: true },
    });
    if (!period) throw new NotFoundException('Période introuvable');

    const products = await exec.inventoryProduct.findMany({
      where: { branchId: period.branchId, isActive: true },
      select: { id: true, defaultCost: true },
    });
    if (products.length === 0) return { created: 0, refreshed: 0 };

    const existing = await exec.inventoryLine.findMany({
      where: { periodId },
      select: {
        id: true,
        productId: true,
        openingUnitCost: true,
        closingUnitCost: true,
      },
    });
    const byProduct = new Map(existing.map((l) => [l.productId, l]));

    const toCreate: Array<{
      periodId: string;
      productId: string;
      openingUnitCost: Prisma.Decimal;
      closingUnitCost: Prisma.Decimal;
    }> = [];
    const toRefresh: Array<{
      id: string;
      openingUnitCost: Prisma.Decimal;
      closingUnitCost: Prisma.Decimal;
    }> = [];

    for (const p of products) {
      const line = byProduct.get(p.id);
      if (!line) {
        toCreate.push({
          periodId,
          productId: p.id,
          openingUnitCost: p.defaultCost,
          closingUnitCost: p.defaultCost,
        });
        continue;
      }
      // Only refresh costs if product has a non-zero defaultCost AND at least
      // one of the existing line's costs is 0 — preserves any non-zero value
      // the user already entered.
      if (!p.defaultCost.isZero()) {
        const fixOpening = line.openingUnitCost.isZero();
        const fixClosing = line.closingUnitCost.isZero();
        if (fixOpening || fixClosing) {
          toRefresh.push({
            id: line.id,
            openingUnitCost: fixOpening ? p.defaultCost : line.openingUnitCost,
            closingUnitCost: fixClosing ? p.defaultCost : line.closingUnitCost,
          });
        }
      }
    }

    if (toCreate.length > 0) {
      await exec.inventoryLine.createMany({ data: toCreate, skipDuplicates: true });
    }
    if (toRefresh.length > 0) {
      await Promise.all(
        toRefresh.map((r) =>
          exec.inventoryLine.update({
            where: { id: r.id },
            data: {
              openingUnitCost: r.openingUnitCost,
              closingUnitCost: r.closingUnitCost,
            },
          }),
        ),
      );
    }

    return { created: toCreate.length, refreshed: toRefresh.length };
  }

  private async assertMutable(periodId: string, user: RequestUser) {
    const period = await this.prisma.inventoryPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Période introuvable');
    if (period.status === PeriodStatus.CLOSED && !canBypassClosedPeriod(user.role)) {
      throw new ForbiddenException(
        'Période clôturée : seul un OWNER ou ADMIN peut modifier',
      );
    }
    return period;
  }

  /**
   * Recomputes each line's consumption + the period's InventoryReport based
   * on the *current* opening/closing values and the *persisted* purchase
   * snapshot (`purchasesQuantity`/`purchasesValue` were frozen at close()).
   *
   * Called after an admin override edit on a CLOSED period so the report,
   * dashboard KPIs and exports stay in sync with the corrected lines.
   *
   * We don't re-aggregate from PurchaseItem because the snapshot is the
   * accounting truth at closure time — changing it would silently rewrite
   * history if new purchases for that month were created after the fact.
   */
  private async reconcileClosedReport(
    tx: Prisma.TransactionClient,
    periodId: string,
  ): Promise<void> {
    // Joindre `category.categoryType` pour pouvoir ventiler chaque ligne
    // dans son bucket Food / Paper / Cleaning. Sans cet include, on
    // perdrait l'info lors d'un override admin.
    const [lines, report] = await Promise.all([
      tx.inventoryLine.findMany({
        where: { periodId },
        include: {
          product: {
            select: { category: { select: { categoryType: true } } },
          },
        },
      }),
      tx.inventoryReport.findUnique({ where: { periodId } }),
    ]);

    let openingValue = new Prisma.Decimal(0);
    let purchasesValue = new Prisma.Decimal(0);
    let closingValue = new Prisma.Decimal(0);

    // V4 ventilation : mêmes 3 buckets qu'à la clôture. Garde l'invariant
    // realCost = food + paper + cleaning sur les périodes corrigées.
    const bucketAccum: Record<CostFamily, {
      opening: Prisma.Decimal;
      purchases: Prisma.Decimal;
      closing: Prisma.Decimal;
    }> = {
      FOOD: { opening: new Prisma.Decimal(0), purchases: new Prisma.Decimal(0), closing: new Prisma.Decimal(0) },
      PAPER: { opening: new Prisma.Decimal(0), purchases: new Prisma.Decimal(0), closing: new Prisma.Decimal(0) },
      CLEANING: { opening: new Prisma.Decimal(0), purchases: new Prisma.Decimal(0), closing: new Prisma.Decimal(0) },
    };

    // Compute totals + queue per-line updates, fire in parallel so Prisma
    // pipelines them on the tx connection (keeps the whole reconcile under
    // the tx timeout even with hundreds of lines).
    const updates: Promise<unknown>[] = [];
    for (const line of lines) {
      const openLineValue = line.openingQuantity.mul(line.openingUnitCost);
      const closeLineValue = line.closingQuantity.mul(line.closingUnitCost);
      const consumptionQty = computeConsumptionQuantity({
        opening: line.openingQuantity,
        purchases: line.purchasesQuantity,
        transferIn: line.transferInQuantity,
        transferOut: line.transferOutQuantity,
        closing: line.closingQuantity,
      });
      const consumptionVal = openLineValue
        .plus(line.purchasesValue)
        .minus(closeLineValue);

      updates.push(
        tx.inventoryLine.update({
          where: { id: line.id },
          data: {
            consumptionQuantity: consumptionQty,
            consumptionValue: consumptionVal,
          },
        }),
      );

      openingValue = openingValue.plus(openLineValue);
      purchasesValue = purchasesValue.plus(line.purchasesValue);
      closingValue = closingValue.plus(closeLineValue);

      const bucket = categoryTypeToBucket(
        line.product.category?.categoryType ?? null,
      );
      const acc = bucketAccum[bucket];
      acc.opening = acc.opening.plus(openLineValue);
      acc.purchases = acc.purchases.plus(line.purchasesValue);
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
    const sales = report?.salesRevenue ?? null;
    const foodCostPct = sales && sales.gt(0) ? realCost.div(sales).mul(100) : null;

    await tx.inventoryReport.upsert({
      where: { periodId },
      create: {
        periodId,
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
        foodCostPercentage: foodCostPct ?? undefined,
        generatedAt: new Date(),
      },
    });
  }

  /**
   * Propagates corrected closing quantities/costs of a CLOSED period N to the
   * opening quantities/costs of its direct successor (period N+1). Enforces
   * the business invariant `closingQuantity(N) === openingQuantity(N+1)`.
   *
   * Only N+1 is touched — propagating further would risk overwriting manual
   * saisies on N+2 / N+3. The UI warns the user to verify downstream months.
   *
   * If N+1 is itself CLOSED, also reconcile its report so the dashboard stays
   * in sync.
   */
  private async propagateToNextPeriod(
    tx: Prisma.TransactionClient,
    closedPeriod: { id: string; branchId: string; year: number; month: number; status: PeriodStatus },
  ): Promise<void> {
    const nextMonth = closedPeriod.month === 12 ? 1 : closedPeriod.month + 1;
    const nextYear = closedPeriod.month === 12 ? closedPeriod.year + 1 : closedPeriod.year;
    const next = await tx.inventoryPeriod.findUnique({
      where: {
        branchId_year_month: {
          branchId: closedPeriod.branchId,
          year: nextYear,
          month: nextMonth,
        },
      },
    });
    if (!next) return; // no downstream period yet — nothing to sync

    const lines = await tx.inventoryLine.findMany({
      where: { periodId: closedPeriod.id },
      select: { productId: true, closingQuantity: true, closingUnitCost: true },
    });

    await Promise.all(
      lines.map((l) =>
        tx.inventoryLine.upsert({
          where: { periodId_productId: { periodId: next.id, productId: l.productId } },
          create: {
            periodId: next.id,
            productId: l.productId,
            openingQuantity: l.closingQuantity,
            openingUnitCost: l.closingUnitCost,
            closingUnitCost: l.closingUnitCost,
            transferInQuantity: 0,
            transferOutQuantity: 0,
          },
          update: {
            openingQuantity: l.closingQuantity,
            openingUnitCost: l.closingUnitCost,
            // DO NOT copy transfer quantities! They do not carry over to the next month.
            transferInQuantity: 0,
            transferOutQuantity: 0,
          },
        }),
      ),
    );

    if (next.status === PeriodStatus.CLOSED) {
      await this.reconcileClosedReport(tx, next.id);
    }
  }

  async upsertOne(periodId: string, dto: UpsertLineDto, user: RequestUser) {
    const period = await this.assertMutable(periodId, user);
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.inventoryLine.upsert({
        where: { periodId_productId: { periodId, productId: dto.productId } },
        create: {
          periodId,
          productId: dto.productId,
          openingQuantity: dto.openingQuantity ?? 0,
          openingUnitCost: dto.openingUnitCost ?? 0,
          closingQuantity: dto.closingQuantity ?? 0,
          closingUnitCost: dto.closingUnitCost ?? 0,
        },
        update: {
          ...(dto.openingQuantity !== undefined && { openingQuantity: dto.openingQuantity }),
          ...(dto.openingUnitCost !== undefined && { openingUnitCost: dto.openingUnitCost }),
          ...(dto.closingQuantity !== undefined && { closingQuantity: dto.closingQuantity }),
          ...(dto.closingUnitCost !== undefined && { closingUnitCost: dto.closingUnitCost }),
        },
      });
      if (period.status === PeriodStatus.CLOSED) {
        await this.reconcileClosedReport(tx, periodId);
        await this.propagateToNextPeriod(tx, period);
      }
      return result;
    }, { timeout: 30_000, maxWait: 10_000 });
  }

  async bulkUpsert(periodId: string, dto: BulkLinesDto, user: RequestUser) {
    const period = await this.assertMutable(periodId, user);
    await this.prisma.$transaction(
      async (tx) => {
        // Fire all upserts in parallel — Prisma pipelines them on the tx
        // connection, which keeps a 200-line bulk well under the timeout.
        await Promise.all(
          dto.lines.map((line) =>
            tx.inventoryLine.upsert({
              where: { periodId_productId: { periodId, productId: line.productId } },
              create: {
                periodId,
                productId: line.productId,
                openingQuantity: line.openingQuantity ?? 0,
                openingUnitCost: line.openingUnitCost ?? 0,
                closingQuantity: line.closingQuantity ?? 0,
                closingUnitCost: line.closingUnitCost ?? 0,
              },
              update: {
                ...(line.openingQuantity !== undefined && { openingQuantity: line.openingQuantity }),
                ...(line.openingUnitCost !== undefined && { openingUnitCost: line.openingUnitCost }),
                ...(line.closingQuantity !== undefined && { closingQuantity: line.closingQuantity }),
                ...(line.closingUnitCost !== undefined && { closingUnitCost: line.closingUnitCost }),
              },
            }),
          ),
        );
        if (period.status === PeriodStatus.CLOSED) {
          await this.reconcileClosedReport(tx, periodId);
          // Closing values of N were just corrected — sync N+1's opening so
          // the invariant closing(N) === opening(N+1) holds. V1 prudent: only
          // direct successor. UI warns user to verify N+2, N+3 if any.
          await this.propagateToNextPeriod(tx, period);
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    return this.findByPeriod(periodId);
  }
}
