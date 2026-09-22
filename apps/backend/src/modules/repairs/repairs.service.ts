import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountingSourceType,
  ExpenseCategory,
  Prisma,
  RepairEntry,
  RepairStatus,
} from '@prisma/client';
import { sumAmount } from '@inventorymdb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateRepairEntryDto } from './dto/create-repair-entry.dto';
import { UpdateRepairEntryDto } from './dto/update-repair-entry.dto';
import { ListRepairEntriesDto } from './dto/list-repair-entries.dto';
import {
  resolveBranchForMutation,
  resolveBranchScope,
} from '../../common/helpers/branch-scope.helper';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  monthStartUTC,
  monthEndExclusiveUTC,
} from '../../common/helpers/business-date.helper';
import { AccountingCategoriesService } from '../accounting-categories/accounting-categories.service';

export interface RepairEntryPayload {
  id: string;
  branchId: string;
  date: string;
  title: string;
  equipment: string | null;
  vendorName: string | null;
  amountBeforeTax: string;
  totalAmount: string;
  status: RepairStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function serialize(row: RepairEntry): RepairEntryPayload {
  return {
    id: row.id,
    branchId: row.branchId,
    date: row.date.toISOString().slice(0, 10),
    title: row.title,
    equipment: row.equipment,
    vendorName: row.vendorName,
    amountBeforeTax: row.amountBeforeTax.toString(),
    totalAmount: row.totalAmount.toString(),
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class RepairsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingCategories: AccountingCategoriesService,
  ) {}

  /** total = HT (always recomputed server-side; no sales tax in Morocco). */
  private computeTotal(ht: number): Prisma.Decimal {
    return new Prisma.Decimal(sumAmount(ht).total);
  }

  private formatDateFR(d: Date): string {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  /**
   * Idempotent 1-to-1 sync of a RepairEntry into the AccountingExpense table.
   * Category is `MAINTENANCE` — reuses the existing expense bucket so the
   * accountant already has reporting for it, and the financial report's
   * MAINTENANCE category naturally accumulates repair costs.
   *
   * The amount flows through from the repair row.
   * Upsert keyed by repairId — re-syncs collapse into a single update.
   *
   * Double-count safety: see financial-reports.service.ts. Repairs are
   * counted ONCE via the MAINTENANCE bucket of `expensesByCategory`. There is
   * no separate "repair cost" line in the financial report.
   */
  private async syncAccountingExpenseForRepair(
    tx: Prisma.TransactionClient,
    repairId: string,
  ): Promise<void> {
    const r = await tx.repairEntry.findUnique({ where: { id: repairId } });
    if (!r) return;

    const subject = r.equipment?.trim() || r.title;
    const description = `Réparation — ${subject} — ${this.formatDateFR(r.date)}`.slice(
      0,
      500,
    );

    // Repairs land under the dynamic "Maintenance" category (seeded by the
    // migration; recreated on the fly if a user manually deleted it).
    const category = await this.accountingCategories.findOrCreate(
      'Maintenance',
      tx,
    );

    await tx.accountingExpense.upsert({
      where: { repairId },
      create: {
        branchId: r.branchId,
        expenseDate: r.date,
        transactionDate: null,
        supplierId: null,
        supplierName: r.vendorName?.slice(0, 150) ?? null,
        category: ExpenseCategory.MAINTENANCE,
        accountingCategoryId: category.id,
        description,
        referenceNumber: null,
        paymentMethod: null,
        amountBeforeTax: r.amountBeforeTax,
        totalAmount: r.totalAmount,
        notes: r.notes ?? null,
        sourceType: AccountingSourceType.REPAIR,
        repairId: r.id,
        // Repairs default to TRUE — they're real P&L items the user expects
        // in the monthly financial report. The user can opt a specific row
        // OUT via the toggle on the accounting form if needed.
        includeInFinancialReports: true,
      },
      update: {
        branchId: r.branchId,
        expenseDate: r.date,
        supplierName: r.vendorName?.slice(0, 150) ?? null,
        category: ExpenseCategory.MAINTENANCE,
        accountingCategoryId: category.id,
        description,
        amountBeforeTax: r.amountBeforeTax,
        totalAmount: r.totalAmount,
        notes: r.notes ?? null,
        sourceType: AccountingSourceType.REPAIR,
        // On update, do NOT touch `includeInFinancialReports` — the user
        // may have toggled it OFF on the accounting form, and the source
        // edit shouldn't stomp that decision.
      },
    });
  }

  async findAll(q: ListRepairEntriesDto, user?: RequestUser): Promise<RepairEntryPayload[]> {
    const scope = resolveBranchScope(user, q.branchId);
    const where: Prisma.RepairEntryWhereInput = {};
    if (scope) where.branchId = scope;
    if (q.month && q.year) {
      const start = monthStartUTC(q.year, q.month);
      const end = monthEndExclusiveUTC(q.year, q.month);
      where.date = { gte: start, lt: end };
    }
    if (q.status) where.status = q.status;
    const rows = await this.prisma.repairEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(serialize);
  }

  async findOne(id: string): Promise<RepairEntryPayload> {
    const row = await this.prisma.repairEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Réparation introuvable');
    return serialize(row);
  }

  async summary(month: number, year: number, user?: RequestUser, branchIdParam?: string) {
    const scope = resolveBranchScope(user, branchIdParam ?? null);
    const start = monthStartUTC(year, month);
    const end = monthEndExclusiveUTC(year, month);
    const where: Prisma.RepairEntryWhereInput = { date: { gte: start, lt: end } };
    if (scope) where.branchId = scope;
    const rows = await this.prisma.repairEntry.findMany({
      where,
      select: { totalAmount: true, status: true },
    });
    const totalAmount = rows.reduce((s, r) => s + Number(r.totalAmount), 0);
    const countByStatus = {
      PLANNED: 0,
      IN_PROGRESS: 0,
      DONE: 0,
    } as Record<RepairStatus, number>;
    for (const r of rows) countByStatus[r.status] += 1;
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return {
      selectedPeriod: `${months[month - 1]} ${year}`,
      totalAmount: Math.round(totalAmount * 100) / 100,
      entriesCount: rows.length,
      countByStatus,
    };
  }

  async create(dto: CreateRepairEntryDto, user?: RequestUser): Promise<RepairEntryPayload> {
    const branchId = resolveBranchForMutation(user, dto.branchId);
    const total = this.computeTotal(dto.amountBeforeTax);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.repairEntry.create({
        data: {
          branchId,
          date: dto.date,
          title: dto.title.trim(),
          equipment: dto.equipment?.trim() || null,
          vendorName: dto.vendorName?.trim() || null,
          amountBeforeTax: new Prisma.Decimal(dto.amountBeforeTax),
          totalAmount: total,
          status: dto.status ?? RepairStatus.PLANNED,
          notes: dto.notes?.trim() || null,
        },
      });
      await this.syncAccountingExpenseForRepair(tx, created.id);
      return created;
    });
    return serialize(row);
  }

  async update(id: string, dto: UpdateRepairEntryDto): Promise<RepairEntryPayload> {
    const existing = await this.prisma.repairEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Réparation introuvable');

    const ht = dto.amountBeforeTax ?? Number(existing.amountBeforeTax.toString());

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.repairEntry.update({
        where: { id },
        data: {
          ...(dto.date && { date: dto.date }),
          ...(dto.title !== undefined && { title: dto.title.trim() }),
          ...(dto.equipment !== undefined && { equipment: dto.equipment?.trim() || null }),
          ...(dto.vendorName !== undefined && { vendorName: dto.vendorName?.trim() || null }),
          ...(dto.amountBeforeTax !== undefined && {
            amountBeforeTax: new Prisma.Decimal(dto.amountBeforeTax),
          }),
          totalAmount: this.computeTotal(ht),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
        },
      });
      await this.syncAccountingExpenseForRepair(tx, updated.id);
      return updated;
    });
    return serialize(row);
  }

  async remove(id: string): Promise<{ success: true }> {
    await this.findOne(id);
    // FK cascade on the repairId relation auto-removes the linked
    // AccountingExpense row — no manual cleanup needed.
    await this.prisma.repairEntry.delete({ where: { id } });
    return { success: true };
  }
}
