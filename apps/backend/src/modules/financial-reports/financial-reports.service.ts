import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingSourceType,
  FinancialReportStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveBranchScope } from '../../common/helpers/branch-scope.helper';
import {
  monthStartUTC,
  monthEndExclusiveUTC,
} from '../../common/helpers/business-date.helper';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { UpdateFinancialReportDto } from './dto/update-financial-report.dto';

/**
 * Shape returned to the client. Decimals serialized as strings to dodge the
 * global ClassSerializerInterceptor (avoids `{s,e,d}` JSON output).
 */
export interface FinancialReportPayload {
  id: string;
  branchId: string;
  month: number;
  year: number;
  status: FinancialReportStatus;

  sales: string;
  discounts: string;
  employeeMeals: string;
  tips: string;
  otherRevenue: string;
  laborCost: string;
  notes: string | null;

  /** Ventilation des coûts inventaire (V4). realCost = food + paper + cleaning. */
  foodCost: string;
  paperCost: string;
  cleaningCost: string;
  realCost: string;
  /**
   * Keyed by the REAL category name (free-form, dynamic), no longer by an
   * enum value. The previous version was `Partial<Record<ExpenseCategory,
   * number>>` and the frontend mapped each key through `EXPENSE_CATEGORY_LABEL`
   * to render. Now the key IS the human label — the frontend renders it
   * directly.
   */
  expensesByCategory: Record<string, number>;
  totalExpenses: string;
  grossRevenue: string;
  netRevenue: string;
  grossProfit: string;
  netProfit: string;
  foodCostPercentage: string | null;
  paperCostPercentage: string | null;
  cleaningCostPercentage: string | null;
  realCostPercentage: string | null;
  netMarginPercentage: string | null;
  expenseRatio: string | null;

  inventoryPeriod: { id: string; month: number; year: number; status: 'OPEN' | 'CLOSED' } | null;

  lockedAt: string | null;
  lockedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class FinancialReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  /**
   * Get-or-create the monthly P&L for (branch, month, year). Creates a DRAFT
   * shell if none exists so the user can start typing revenue immediately.
   * Returns live-computed values for DRAFT, or the persisted snapshot for
   * LOCKED.
   */
  async getOrCreate(
    branchIdParam: string | undefined,
    month: number,
    year: number,
    user: RequestUser,
  ): Promise<FinancialReportPayload> {
    // Reads are branch-scoped; for the financial report we ALWAYS need a
    // concrete branch — there's no "all branches" report in V1.
    const branchId = resolveBranchScope(user, branchIdParam ?? null);
    if (!branchId) {
      throw new BadRequestException(
        'branchId requis pour le rapport financier (pas de vue multi-succursale en V1).',
      );
    }

    const existing = await this.prisma.financialReport.findUnique({
      where: { branchId_year_month: { branchId, year, month } },
      include: { lockedBy: { select: { id: true, name: true } } },
    });
    if (existing) {
      return existing.status === FinancialReportStatus.LOCKED
        ? this.serializeLocked(existing)
        : this.serializeLive(existing);
    }

    const created = await this.prisma.financialReport.create({
      data: { branchId, month, year, status: FinancialReportStatus.DRAFT },
      include: { lockedBy: { select: { id: true, name: true } } },
    });
    return this.serializeLive(created);
  }

  /**
   * Update revenue/labor/notes on a DRAFT report. OWNER/ADMIN can override
   * a LOCKED report (rare correction path). MANAGER cannot edit LOCKED.
   */
  async update(id: string, dto: UpdateFinancialReportDto, user: RequestUser): Promise<FinancialReportPayload> {
    const report = await this.findById(id);
    if (
      report.status === FinancialReportStatus.LOCKED &&
      !(await this.canUnlock(user))
    ) {
      throw new ForbiddenException(
        'Rapport verrouillé : seul un OWNER ou ADMIN peut le modifier.',
      );
    }

    const updated = await this.prisma.financialReport.update({
      where: { id },
      data: {
        ...(dto.sales !== undefined && { sales: dto.sales }),
        ...(dto.discounts !== undefined && { discounts: dto.discounts }),
        ...(dto.employeeMeals !== undefined && { employeeMeals: dto.employeeMeals }),
        ...(dto.tips !== undefined && { tips: dto.tips }),
        ...(dto.otherRevenue !== undefined && { otherRevenue: dto.otherRevenue }),
        ...(dto.laborCost !== undefined && { laborCost: dto.laborCost }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { lockedBy: { select: { id: true, name: true } } },
    });

    return updated.status === FinancialReportStatus.LOCKED
      ? this.serializeLocked(updated)
      : this.serializeLive(updated);
  }

  /**
   * Snapshot all computed values into the persisted columns and flip status
   * to LOCKED. Idempotent — re-locking refreshes the snapshot.
   */
  async lock(id: string, user: RequestUser): Promise<FinancialReportPayload> {
    if (!(await this.canUnlock(user))) {
      throw new ForbiddenException('Seul un OWNER ou ADMIN peut verrouiller un rapport.');
    }
    const report = await this.findById(id);
    const calc = await this.computeLive(report);

    const locked = await this.prisma.financialReport.update({
      where: { id },
      data: {
        status: FinancialReportStatus.LOCKED,
        // V4 : snapshotFoodCost désigne maintenant SPÉCIFIQUEMENT la part
        // Food. Paper et Cleaning ont leurs propres colonnes snapshot.
        snapshotFoodCost: calc.foodCost,
        snapshotPaperCost: calc.paperCost,
        snapshotCleaningCost: calc.cleaningCost,
        snapshotExpensesByCategory: calc.expensesByCategory as Prisma.InputJsonValue,
        snapshotTotalExpenses: calc.totalExpenses,
        snapshotGrossRevenue: calc.grossRevenue,
        snapshotNetRevenue: calc.netRevenue,
        snapshotNetProfit: calc.netProfit,
        snapshotFoodCostPct: calc.foodCostPct,
        snapshotNetMarginPct: calc.netMarginPct,
        lockedAt: new Date(),
        lockedById: user.id,
      },
      include: { lockedBy: { select: { id: true, name: true } } },
    });

    return this.serializeLocked(locked);
  }

  /**
   * Reopen a LOCKED report for editing. Keeps the snapshot in place for
   * audit purposes — re-locking will refresh it from current data.
   */
  async unlock(id: string, user: RequestUser): Promise<FinancialReportPayload> {
    if (!(await this.canUnlock(user))) {
      throw new ForbiddenException('Seul un OWNER ou ADMIN peut déverrouiller un rapport.');
    }
    const report = await this.findById(id);
    if (report.status === FinancialReportStatus.DRAFT) return this.serializeLive(report);

    const unlocked = await this.prisma.financialReport.update({
      where: { id },
      data: { status: FinancialReportStatus.DRAFT, lockedAt: null, lockedById: null },
      include: { lockedBy: { select: { id: true, name: true } } },
    });
    return this.serializeLive(unlocked);
  }

  /** Internal — used by exports module. */
  async getById(id: string, user: RequestUser): Promise<FinancialReportPayload> {
    const report = await this.findById(id);
    // Scope check — re-resolve the branch using the user. resolveBranchScope
    // throws if a MANAGER queries another branch.
    resolveBranchScope(user, report.branchId);
    return report.status === FinancialReportStatus.LOCKED
      ? this.serializeLocked(report)
      : this.serializeLive(report);
  }

  // -------------------------------------------------------------------
  // Calc engine
  // -------------------------------------------------------------------

  /**
   * Computes all derived values for a report from the source-of-truth data.
   *
   * Anti-double-counting topology — every dollar lands in exactly one bucket:
   *
   *   1. foodCost          ← InventoryReport.realCost (= opening + purchases
   *                          − closing). PURCHASE-sourced AccountingExpense
   *                          rows are EXCLUDED via sourceType filter so the
   *                          same invoices aren't summed twice.
   *
   *   2. laborCost (auto)  ← Σ LaborEntry.totalAmount for the month. Labor
   *                          stays standalone — it never lands in
   *                          AccountingExpense at all. Falls back to the
   *                          manually-typed `report.laborCost` if no
   *                          LaborEntry exists (legacy reports).
   *
   *   3. categoryTotals    ← groupBy(accountingCategoryId) over the remaining
   *                          AccountingExpense rows that have OPTED IN via
   *                          `includeInFinancialReports = true`. Categories
   *                          surface with their REAL names (never "Autres"
   *                          unless the user typed "Autres" explicitly).
   *
   *   - net revenue   = sales − discounts − employeeMeals + tips + otherRevenue
   *   - gross revenue = sales + tips + otherRevenue
   *   - totalExpenses = foodCost + Σ categoryTotals + laborCost
   */
  private async computeLive(report: {
    id: string;
    branchId: string;
    month: number;
    year: number;
    sales: Prisma.Decimal;
    discounts: Prisma.Decimal;
    employeeMeals: Prisma.Decimal;
    tips: Prisma.Decimal;
    otherRevenue: Prisma.Decimal;
    laborCost: Prisma.Decimal;
  }) {
    const start = monthStartUTC(report.year, report.month);
    const end = monthEndExclusiveUTC(report.year, report.month);

    const [period, accountingGroups, laborSync] = await Promise.all([
      this.prisma.inventoryPeriod.findUnique({
        where: {
          branchId_year_month: {
            branchId: report.branchId,
            year: report.year,
            month: report.month,
          },
        },
        include: {
          report: {
            select: {
              realCost: true,
              foodCost: true,
              paperCost: true,
              cleaningCost: true,
            },
          },
        },
      }),
      // Aggregate expenses that opted IN via `includeInFinancialReports`.
      // PURCHASE rows are also filtered out by sourceType — defense in depth
      // in case someone (manually, via SQL) flipped the flag on a PURCHASE
      // row, which would double-count with food cost.
      //
      // NOUVELLE RÈGLE MÉTIER (LOT 2) — On somme `amountBeforeTax` (HT)
      // et non plus `totalAmount` (TTC). La section Comptabilité continue
      // de stocker et d'afficher HT/TPS/TVQ/TTC ; seul le rapport financier
      // consomme désormais le HT pour éviter la double-imposition dans
      // les analyses de dépenses.
      //
      // Cas suspects (amountBeforeTax=0 & totalAmount>0) : contribuent 0.
      // Aucun fallback TTC — décision métier validée.
      this.prisma.accountingExpense.groupBy({
        by: ['accountingCategoryId'],
        where: {
          branchId: report.branchId,
          expenseDate: { gte: start, lt: end },
          deletedAt: null,
          includeInFinancialReports: true,
          sourceType: { not: AccountingSourceType.PURCHASE },
          // The dynamic category is REQUIRED in the new world; the filter
          // here just guards against any legacy row whose backfill might
          // have failed for some reason.
          accountingCategoryId: { not: null },
        },
        _sum: { amountBeforeTax: true },
      }),
      // Labor cost is sourced DIRECTLY from `LaborEntry.totalAmount` — the
      // Labor module is standalone and never mirrors into AccountingExpense.
      this.prisma.laborEntry.aggregate({
        where: {
          branchId: report.branchId,
          date: { gte: start, lt: end },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    // V4 ventilation. `realCost` reste = food + paper + cleaning (invariant
    // garanti par la close()). Pour les rapports legacy qui n'ont pas
    // encore reçu de re-clôture, `foodCost` côté DB est déjà backfillé
    // à la valeur historique du realCost (via la migration). Donc la
    // somme reste cohérente.
    const inv = period?.report;
    const foodCost = inv?.foodCost ?? new Prisma.Decimal(0);
    const paperCost = inv?.paperCost ?? new Prisma.Decimal(0);
    const cleaningCost = inv?.cleaningCost ?? new Prisma.Decimal(0);
    const realCost = inv?.realCost ?? new Prisma.Decimal(0);

    // Auto-derived labor cost. Fall back to the typed `report.laborCost`
    // only if no LaborEntry exists this month — protects legacy reports.
    const autoLaborCost = laborSync._sum.totalAmount ?? new Prisma.Decimal(0);
    const laborCost = autoLaborCost.gt(0) ? autoLaborCost : report.laborCost;

    // Resolve every grouped categoryId → name in a single query, then build
    // the keyed-by-name map for the wire payload.
    const categoryIds = accountingGroups
      .map((g) => g.accountingCategoryId)
      .filter((id): id is string => !!id);
    const categoryNamesById = new Map<string, string>();
    if (categoryIds.length > 0) {
      const cats = await this.prisma.accountingCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      });
      for (const c of cats) categoryNamesById.set(c.id, c.name);
    }

    const expensesByCategory: Record<string, number> = {};
    let categoryTotal = new Prisma.Decimal(0);
    for (const row of accountingGroups) {
      if (!row.accountingCategoryId) continue;
      const name = categoryNamesById.get(row.accountingCategoryId);
      if (!name) continue;
      // Lecture alignée sur le `_sum: { amountBeforeTax: true }` ci-dessus
      // (LOT 2 — HT only pour le rapport financier).
      const sum = row._sum.amountBeforeTax ?? new Prisma.Decimal(0);
      // Aggregate across category-id collisions just in case (shouldn't
      // happen but cheap to be safe).
      expensesByCategory[name] = (expensesByCategory[name] ?? 0) + sum.toNumber();
      categoryTotal = categoryTotal.plus(sum);
    }
    // Labor is surfaced ONLY through the dedicated top-level `laborCost`
    // field below — NOT injected into `expensesByCategory`. The previous
    // version did both, which made the frontend render labor twice ("Labor
    // cost" via the dedicated line + "Main-d'œuvre" via the category map).
    // Source-of-truth stays `LaborEntry.totalAmount`; the frontend renders
    // it as a single row labelled "Main-d'œuvre" / source "Main d'œuvre".

    const grossRevenue = report.sales.plus(report.tips).plus(report.otherRevenue);
    const netRevenue = report.sales
      .minus(report.discounts)
      .minus(report.employeeMeals)
      .plus(report.tips)
      .plus(report.otherRevenue);

    // totalExpenses utilise `realCost` (= food + paper + cleaning) plutôt
    // que foodCost seul, sinon paperCost et cleaningCost manqueraient au
    // total. grossProfit garde `realCost` pour la même raison (le P&L
    // tient compte de TOUS les coûts d'inventaire, pas seulement food).
    const totalExpenses = realCost.plus(categoryTotal).plus(laborCost);
    const grossProfit = netRevenue.minus(realCost);
    const netProfit = netRevenue.minus(totalExpenses);

    const foodCostPct = netRevenue.gt(0) ? foodCost.div(netRevenue).mul(100) : null;
    const paperCostPct = netRevenue.gt(0) ? paperCost.div(netRevenue).mul(100) : null;
    const cleaningCostPct = netRevenue.gt(0) ? cleaningCost.div(netRevenue).mul(100) : null;
    const realCostPct = netRevenue.gt(0) ? realCost.div(netRevenue).mul(100) : null;
    const netMarginPct = netRevenue.gt(0) ? netProfit.div(netRevenue).mul(100) : null;
    const expenseRatio = netRevenue.gt(0) ? totalExpenses.div(netRevenue).mul(100) : null;

    return {
      foodCost,
      paperCost,
      cleaningCost,
      realCost,
      // `laborCost` is the EFFECTIVE value used in the calc — auto-derived
      // from the LABOR sync when present, otherwise the manually-typed field.
      // Exposed so `serializeLive` can surface it instead of the raw field.
      laborCost,
      expensesByCategory,
      categoryTotal,
      totalExpenses,
      grossRevenue,
      netRevenue,
      grossProfit,
      netProfit,
      foodCostPct,
      paperCostPct,
      cleaningCostPct,
      realCostPct,
      netMarginPct,
      expenseRatio,
      inventoryPeriod: period
        ? { id: period.id, month: period.month, year: period.year, status: period.status }
        : null,
    };
  }

  // -------------------------------------------------------------------
  // Serializers
  // -------------------------------------------------------------------

  private async serializeLive(
    report: Awaited<ReturnType<typeof this.findById>>,
  ): Promise<FinancialReportPayload> {
    const calc = await this.computeLive(report);
    return {
      id: report.id,
      branchId: report.branchId,
      month: report.month,
      year: report.year,
      status: report.status,
      sales: report.sales.toString(),
      discounts: report.discounts.toString(),
      employeeMeals: report.employeeMeals.toString(),
      tips: report.tips.toString(),
      otherRevenue: report.otherRevenue.toString(),
      // Surface the EFFECTIVE labor cost (auto-derived from LABOR sync when
      // present, else the typed override). The raw `report.laborCost` field
      // remains in the DB as a fallback / legacy override.
      laborCost: calc.laborCost.toString(),
      notes: report.notes,
      foodCost: calc.foodCost.toString(),
      paperCost: calc.paperCost.toString(),
      cleaningCost: calc.cleaningCost.toString(),
      realCost: calc.realCost.toString(),
      expensesByCategory: calc.expensesByCategory,
      totalExpenses: calc.totalExpenses.toString(),
      grossRevenue: calc.grossRevenue.toString(),
      netRevenue: calc.netRevenue.toString(),
      grossProfit: calc.grossProfit.toString(),
      netProfit: calc.netProfit.toString(),
      foodCostPercentage: calc.foodCostPct?.toString() ?? null,
      paperCostPercentage: calc.paperCostPct?.toString() ?? null,
      cleaningCostPercentage: calc.cleaningCostPct?.toString() ?? null,
      realCostPercentage: calc.realCostPct?.toString() ?? null,
      netMarginPercentage: calc.netMarginPct?.toString() ?? null,
      expenseRatio: calc.expenseRatio?.toString() ?? null,
      inventoryPeriod: calc.inventoryPeriod,
      lockedAt: null,
      lockedBy: null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  private serializeLocked(
    report: Awaited<ReturnType<typeof this.findById>>,
  ): FinancialReportPayload {
    // LOCKED reports read from the snapshot — values stay stable even if
    // downstream Accounting / Inventory data is corrected.
    // Old snapshots may still use the legacy enum-keyed shape; new ones use
    // the dynamic-name shape. Both are `Record<string, number>` at runtime —
    // the cast widens the type without re-reading the row.
    const expensesByCategory =
      (report.snapshotExpensesByCategory as Record<string, number> | null) ?? {};
    return {
      id: report.id,
      branchId: report.branchId,
      month: report.month,
      year: report.year,
      status: report.status,
      sales: report.sales.toString(),
      discounts: report.discounts.toString(),
      employeeMeals: report.employeeMeals.toString(),
      tips: report.tips.toString(),
      otherRevenue: report.otherRevenue.toString(),
      laborCost: report.laborCost.toString(),
      notes: report.notes,
      // V4 : pour les snapshots ANTÉRIEURS au split, snapshotFoodCost
      // contient en réalité le realCost total (avant split). On expose
      // donc foodCost = snapshotFoodCost et 0 pour paper/cleaning. Pour
      // les snapshots POSTÉRIEURS au split, paper/cleaning ont leurs
      // propres colonnes peuplées.
      foodCost: (report.snapshotFoodCost ?? new Prisma.Decimal(0)).toString(),
      paperCost: (report.snapshotPaperCost ?? new Prisma.Decimal(0)).toString(),
      cleaningCost: (report.snapshotCleaningCost ?? new Prisma.Decimal(0)).toString(),
      // realCost recomposé en somme — toujours = food + paper + cleaning.
      realCost: (report.snapshotFoodCost ?? new Prisma.Decimal(0))
        .plus(report.snapshotPaperCost ?? new Prisma.Decimal(0))
        .plus(report.snapshotCleaningCost ?? new Prisma.Decimal(0))
        .toString(),
      expensesByCategory,
      totalExpenses: (report.snapshotTotalExpenses ?? new Prisma.Decimal(0)).toString(),
      grossRevenue: (report.snapshotGrossRevenue ?? new Prisma.Decimal(0)).toString(),
      netRevenue: (report.snapshotNetRevenue ?? new Prisma.Decimal(0)).toString(),
      grossProfit: (
        (report.snapshotNetRevenue ?? new Prisma.Decimal(0)).minus(
          (report.snapshotFoodCost ?? new Prisma.Decimal(0))
            .plus(report.snapshotPaperCost ?? new Prisma.Decimal(0))
            .plus(report.snapshotCleaningCost ?? new Prisma.Decimal(0)),
        )
      ).toString(),
      netProfit: (report.snapshotNetProfit ?? new Prisma.Decimal(0)).toString(),
      foodCostPercentage: report.snapshotFoodCostPct?.toString() ?? null,
      // Paper/Cleaning/Real % ne sont pas snapshottés indépendamment — on
      // les recalcule à la volée depuis les valeurs nominales.
      paperCostPercentage: this.pctOf(
        report.snapshotPaperCost,
        report.snapshotNetRevenue,
      ),
      cleaningCostPercentage: this.pctOf(
        report.snapshotCleaningCost,
        report.snapshotNetRevenue,
      ),
      realCostPercentage: this.pctOf(
        (report.snapshotFoodCost ?? new Prisma.Decimal(0))
          .plus(report.snapshotPaperCost ?? new Prisma.Decimal(0))
          .plus(report.snapshotCleaningCost ?? new Prisma.Decimal(0)),
        report.snapshotNetRevenue,
      ),
      netMarginPercentage: report.snapshotNetMarginPct?.toString() ?? null,
      expenseRatio: this.computeExpenseRatio(
        report.snapshotTotalExpenses,
        report.snapshotNetRevenue,
      ),
      inventoryPeriod: null, // not preserved on snapshot — locked report is self-contained
      lockedAt: report.lockedAt?.toISOString() ?? null,
      lockedBy: report.lockedBy ? { id: report.lockedBy.id, name: report.lockedBy.name } : null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  private computeExpenseRatio(
    totalExpenses: Prisma.Decimal | null,
    netRevenue: Prisma.Decimal | null,
  ): string | null {
    if (!totalExpenses || !netRevenue || netRevenue.lte(0)) return null;
    return totalExpenses.div(netRevenue).mul(100).toString();
  }

  /** Generic pct helper for snapshot Paper/Cleaning ratios that weren't
   *  persisted as their own column. Returns null when net revenue is 0
   *  (avoid divide-by-zero) or when the numerator is missing. */
  private pctOf(
    value: Prisma.Decimal | null,
    netRevenue: Prisma.Decimal | null,
  ): string | null {
    if (!value || !netRevenue || netRevenue.lte(0)) return null;
    return value.div(netRevenue).mul(100).toString();
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private async findById(id: string) {
    const report = await this.prisma.financialReport.findUnique({
      where: { id },
      include: { lockedBy: { select: { id: true, name: true } } },
    });
    if (!report) throw new NotFoundException('Rapport financier introuvable');
    return report;
  }

  /** OWNER or ADMIN. Mirrors the permission system without re-importing the
   *  shared lib here (kept service self-contained). */
  private async canUnlock(user: RequestUser): Promise<boolean> {
    return user.role === 'OWNER' || user.role === 'ADMIN';
  }
}
