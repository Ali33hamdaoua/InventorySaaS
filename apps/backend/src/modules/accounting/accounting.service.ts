import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingExpense,
  AccountingSourceType,
  ExpenseCategory,
  Prisma,
} from '@prisma/client';
import { sumAmount } from '@inventorymdb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountingCategoriesService } from '../accounting-categories/accounting-categories.service';
import { CreateAccountingExpenseDto } from './dto/create-accounting-expense.dto';
import { UpdateAccountingExpenseDto } from './dto/update-accounting-expense.dto';
import { ListAccountingExpensesDto } from './dto/list-accounting-expenses.dto';
import { AccountingSummaryQueryDto } from './dto/summary-accounting.dto';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  resolveBranchForMutation,
  resolveBranchScope,
} from '../../common/helpers/branch-scope.helper';
import {
  monthStartUTC,
  monthEndExclusiveUTC,
} from '../../common/helpers/business-date.helper';

// `accountingCategory` is included so the wire payload can surface the
// resolved category name to the frontend (which builds the dynamic dropdown
// from these names).
const EXPENSE_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  accountingCategory: { select: { id: true, name: true, isActive: true } },
} as const;

type ExpenseWithRelations = AccountingExpense & {
  supplier: { id: string; name: string } | null;
  accountingCategory: { id: string; name: string; isActive: boolean } | null;
};

/**
 * Wire format — Prisma Decimal is forced to a string so the global
 * ClassSerializerInterceptor can't emit it as an opaque `{s,e,d}` object.
 * Mirrors the pattern used by ProductsService.
 */
export interface AccountingExpenseDto extends Omit<
  ExpenseWithRelations,
  'amountBeforeTax' | 'totalAmount' | 'purchaseItem'
> {
  amountBeforeTax: string;
  totalAmount: string;
  /** Flattened category NAME — null only if the row pre-dates the migration
   *  (shouldn't happen on a clean DB; defensive null for cosmetic display). */
  categoryName: string | null;
  purchaseItem: {
    id: string;
    quantity: string;
    unitPrice: string;
    product: { id: string; name: string; unit: string };
  } | null;
}

function serialize(row: ExpenseWithRelations): AccountingExpenseDto {
  return {
    ...row,
    amountBeforeTax: row.amountBeforeTax.toString(),
    totalAmount: row.totalAmount.toString(),
    categoryName: row.accountingCategory?.name ?? null,
  } as AccountingExpenseDto;
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingCategories: AccountingCategoriesService,
  ) {}

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /**
   * Authoritative total. Sales taxes were removed with the move to Morocco,
   * so the total simply mirrors the entered amount — this stays a single
   * rounding point shared with the frontend preview.
   */
  private computeAmount(amountBeforeTax: number) {
    return sumAmount(amountBeforeTax);
  }

  private async assertSupplierExists(supplierId: string) {
    const s = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true },
    });
    if (!s) throw new BadRequestException('Fournisseur introuvable');
  }

  /** Returns the active where-clause used by list/summary/exports. */
  buildWhere(
    q: ListAccountingExpensesDto,
    user?: RequestUser,
  ): Prisma.AccountingExpenseWhereInput {
    const scope = resolveBranchScope(user, q.branchId);
    const and: Prisma.AccountingExpenseWhereInput[] = [];
    if (scope) and.push({ branchId: scope });

    if (q.includeDeleted !== 'true') {
      and.push({ deletedAt: null });
    }
    if (q.search) {
      and.push({
        OR: [
          { description: { contains: q.search, mode: 'insensitive' } },
          { supplierName: { contains: q.search, mode: 'insensitive' } },
          { referenceNumber: { contains: q.search, mode: 'insensitive' } },
          { supplier: { name: { contains: q.search, mode: 'insensitive' } } },
        ],
      });
    }
    if (q.accountingCategoryId) {
      and.push({ accountingCategoryId: q.accountingCategoryId });
    }
    if (q.supplierId) and.push({ supplierId: q.supplierId });
    if (q.paymentMethod) and.push({ paymentMethod: q.paymentMethod });
    if (q.startDate) and.push({ expenseDate: { gte: q.startDate } });
    if (q.endDate) and.push({ expenseDate: { lte: q.endDate } });
    if (q.minAmount !== undefined) and.push({ totalAmount: { gte: new Prisma.Decimal(q.minAmount) } });
    if (q.maxAmount !== undefined) and.push({ totalAmount: { lte: new Prisma.Decimal(q.maxAmount) } });

    return and.length ? { AND: and } : {};
  }

  // -------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------

  async findAll(q: ListAccountingExpensesDto, user?: RequestUser) {
    const where = this.buildWhere(q, user);

    const [data, total] = await Promise.all([
      this.prisma.accountingExpense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.accountingExpense.count({ where }),
    ]);

    return {
      data: data.map(serialize),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** Same shape as `findAll` but returns the raw row (used by exports
   *  which need Decimal arithmetic). */
  async findAllRaw(q: ListAccountingExpensesDto, user?: RequestUser) {
    const where = this.buildWhere(q, user);
    const [data, total] = await Promise.all([
      this.prisma.accountingExpense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.accountingExpense.count({ where }),
    ]);
    return { data, total, page: q.page, pageSize: q.pageSize };
  }

  async findOne(id: string): Promise<AccountingExpenseDto> {
    const row = await this.prisma.accountingExpense.findUnique({
      where: { id },
      include: EXPENSE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Dépense introuvable');
    return serialize(row);
  }

  /** Internal variant — returns the raw row (Decimal columns intact). */
  async findOneRaw(id: string): Promise<ExpenseWithRelations> {
    const row = await this.prisma.accountingExpense.findUnique({
      where: { id },
      include: EXPENSE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Dépense introuvable');
    return row;
  }

  /** Returns aggregated KPIs over the given period (or current month). */
  async summary(q: AccountingSummaryQueryDto, user?: RequestUser) {
    const scope = resolveBranchScope(user, q.branchId);
    let start: Date;
    let end: Date;
    let label: string;

    if (q.startDate || q.endDate) {
      const now = new Date();
      start = q.startDate ?? monthStartUTC(now.getFullYear(), 1);
      end = q.endDate ?? now;
      label = 'Période personnalisée';
    } else {
      const now = new Date();
      const month = q.month ?? now.getMonth() + 1;
      const year = q.year ?? now.getFullYear();
      // expenseDate is `@db.Date` (UTC midnight) — keep both bounds at UTC and
      // switch to an exclusive upper bound so we don't get bitten by the
      // local-midnight vs UTC-midnight drift.
      start = monthStartUTC(year, month);
      end = monthEndExclusiveUTC(year, month);
      label = `${MONTHS_FR[month - 1]} ${year}`;
    }

    // Month branch uses an EXCLUSIVE upper bound (first day of next month);
    // custom-range branch still wants the user-supplied endDate to be
    // inclusive (the picker shows June 30, the user expects June 30 included).
    const expenseDateFilter: Prisma.DateTimeFilter =
      q.startDate || q.endDate
        ? { gte: start, lte: end }
        : { gte: start, lt: end };
    const where: Prisma.AccountingExpenseWhereInput = {
      ...(scope ? { branchId: scope } : {}),
      deletedAt: null,
      expenseDate: expenseDateFilter,
    };

    const [agg, perCategory] = await Promise.all([
      this.prisma.accountingExpense.aggregate({
        where,
        _sum: {
          amountBeforeTax: true,
          totalAmount: true,
        },
        _count: { _all: true },
      }),
      // Group by the dynamic categoryId now — the legacy enum is no longer
      // the source of truth for the dropdown / breakdown.
      this.prisma.accountingExpense.groupBy({
        by: ['accountingCategoryId'],
        where,
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 1,
      }),
    ]);

    let topCategory: { id: string | null; label: string; totalAmount: number } | null = null;
    if (perCategory[0]?.accountingCategoryId) {
      const cat = await this.prisma.accountingCategory.findUnique({
        where: { id: perCategory[0].accountingCategoryId },
        select: { id: true, name: true },
      });
      topCategory = cat
        ? {
            id: cat.id,
            label: cat.name,
            totalAmount: Number(perCategory[0]._sum.totalAmount ?? 0),
          }
        : null;
    }

    return {
      selectedPeriod: label,
      totalExpenses: agg._count._all,
      expensesCount: agg._count._all,
      totalBeforeTax: Number(agg._sum.amountBeforeTax ?? 0),
      topCategory,
    };
  }

  // -------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------

  async create(dto: CreateAccountingExpenseDto, user?: RequestUser): Promise<AccountingExpenseDto> {
    const branchId = resolveBranchForMutation(user, dto.branchId);
    if (dto.supplierId) {
      await this.assertSupplierExists(dto.supplierId);
    }

    const amounts = this.computeAmount(dto.amountBeforeTax);

    // Resolve the free-form category name → id (creates the category if
    // needed). The whole thing runs in a transaction so an HTTP-level retry
    // can't write the expense without its category, or vice-versa.
    const row = await this.prisma.$transaction(async (tx) => {
      const category = await this.accountingCategories.findOrCreate(dto.categoryName, tx);

      return tx.accountingExpense.create({
        data: {
          branchId,
          expenseDate: dto.expenseDate,
          transactionDate: dto.transactionDate ?? null,
          supplierId: dto.supplierId ?? null,
          supplierName: dto.supplierName ?? null,
          // Legacy enum kept for rollback safety — default to AUTRES. The
          // real category surfaced to the user lives in accountingCategoryId.
          category: ExpenseCategory.AUTRES,
          accountingCategoryId: category.id,
          description: dto.description,
          referenceNumber: dto.referenceNumber ?? null,
          paymentMethod: dto.paymentMethod ?? null,
          amountBeforeTax: new Prisma.Decimal(amounts.subtotal),
          totalAmount: new Prisma.Decimal(amounts.total),
          notes: dto.notes ?? null,
          // Default per client spec — manual expenses are OPT-IN for the
          // financial report. The frontend toggle just maps to this flag.
          includeInFinancialReports: dto.includeInFinancialReports ?? false,
        },
        include: EXPENSE_INCLUDE,
      });
    });
    return serialize(row);
  }

  /**
   * Friendly source-specific error messages — clarifies WHICH module owns the
   * row so the accountant knows where to go to fix the number.
   */
  private static sourceLockMessage(
    source: AccountingSourceType,
    verb: 'modifier' | 'supprimer',
  ): string {
    switch (source) {
      case AccountingSourceType.PURCHASE:
        return `Cette dépense vient d'un achat. ${
          verb === 'modifier' ? 'Modifiez' : 'Supprimez'
        } l'achat source pour ${
          verb === 'modifier' ? 'changer le montant' : 'retirer la dépense'
        }.`;
      case AccountingSourceType.LABOR:
        return `Cette dépense vient du module Main-d'œuvre. ${
          verb === 'modifier' ? 'Modifiez la ligne source' : 'Supprimez la ligne source'
        } pour ${
          verb === 'modifier' ? 'changer le montant' : 'retirer la dépense'
        }.`;
      case AccountingSourceType.REPAIR:
        return `Cette dépense vient du module Réparations. ${
          verb === 'modifier' ? 'Modifiez la réparation source' : 'Supprimez la réparation source'
        } pour ${
          verb === 'modifier' ? 'changer le montant' : 'retirer la dépense'
        }.`;
      default:
        return '';
    }
  }

  async update(id: string, dto: UpdateAccountingExpenseDto): Promise<AccountingExpenseDto> {
    const existing = await this.findOneRaw(id);
    if (existing.deletedAt) {
      throw new BadRequestException('Cette dépense est supprimée');
    }

    const isAuto = existing.sourceType !== AccountingSourceType.MANUAL;

    if (isAuto) {
      // Auto-synced rows accept `notes` AND `includeInFinancialReports`.
      // Notes are user metadata. `includeInFinancialReports` lets the user
      // opt a specific repair out of the financial report (e.g. cosmetic
      // fix already booked elsewhere) without touching the source row.
      // Anything else would either be silently overwritten on the next sync
      // of the source row or break the audit trail — reject with a precise
      // message pointing at the right module.
      const editableFieldChanged =
        dto.expenseDate !== undefined ||
        dto.transactionDate !== undefined ||
        dto.supplierId !== undefined ||
        dto.supplierName !== undefined ||
        dto.categoryName !== undefined ||
        dto.description !== undefined ||
        dto.referenceNumber !== undefined ||
        dto.paymentMethod !== undefined ||
        dto.amountBeforeTax !== undefined;
      if (editableFieldChanged) {
        throw new BadRequestException(
          AccountingService.sourceLockMessage(existing.sourceType, 'modifier'),
        );
      }
      const row = await this.prisma.accountingExpense.update({
        where: { id },
        data: {
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.includeInFinancialReports !== undefined && {
            includeInFinancialReports: dto.includeInFinancialReports,
          }),
        },
        include: EXPENSE_INCLUDE,
      });
      return serialize(row);
    }

    if (dto.supplierId) {
      await this.assertSupplierExists(dto.supplierId);
    }

    // Fall back to the existing amount if the patch does not carry one.
    const amountBeforeTax =
      dto.amountBeforeTax ?? Number(existing.amountBeforeTax.toString());
    const amounts = this.computeAmount(amountBeforeTax);

    const row = await this.prisma.$transaction(async (tx) => {
      // Resolve the new category name only if provided in the patch.
      const newCategoryId = dto.categoryName
        ? (await this.accountingCategories.findOrCreate(dto.categoryName, tx)).id
        : undefined;

      return tx.accountingExpense.update({
        where: { id },
        data: {
          ...(dto.expenseDate && { expenseDate: dto.expenseDate }),
          ...(dto.transactionDate !== undefined && { transactionDate: dto.transactionDate }),
          ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
          ...(dto.supplierName !== undefined && { supplierName: dto.supplierName }),
          ...(newCategoryId && { accountingCategoryId: newCategoryId }),
          ...(dto.description && { description: dto.description }),
          ...(dto.referenceNumber !== undefined && { referenceNumber: dto.referenceNumber }),
          ...(dto.paymentMethod !== undefined && { paymentMethod: dto.paymentMethod }),
          amountBeforeTax: new Prisma.Decimal(amounts.subtotal),
          totalAmount: new Prisma.Decimal(amounts.total),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.includeInFinancialReports !== undefined && {
            includeInFinancialReports: dto.includeInFinancialReports,
          }),
        },
        include: EXPENSE_INCLUDE,
      });
    });
    return serialize(row);
  }

  /** Soft-delete (sets deletedAt). Hidden from default queries. */
  async remove(id: string): Promise<{ success: true }> {
    const existing = await this.findOneRaw(id);
    if (existing.deletedAt) {
      return { success: true };
    }
    if (existing.sourceType !== AccountingSourceType.MANUAL) {
      throw new BadRequestException(
        AccountingService.sourceLockMessage(existing.sourceType, 'supprimer'),
      );
    }
    await this.prisma.accountingExpense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }
}
