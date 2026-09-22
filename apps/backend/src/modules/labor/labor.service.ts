import { Injectable, NotFoundException } from '@nestjs/common';
import { LaborEntry, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateLaborEntryDto } from './dto/create-labor-entry.dto';
import { UpdateLaborEntryDto } from './dto/update-labor-entry.dto';
import { ListLaborEntriesDto } from './dto/list-labor-entries.dto';
import {
  resolveBranchForMutation,
  resolveBranchScope,
} from '../../common/helpers/branch-scope.helper';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  monthStartUTC,
  monthEndExclusiveUTC,
} from '../../common/helpers/business-date.helper';

/**
 * Labor stays STANDALONE — no auto-sync into AccountingExpense.
 *
 * History: an earlier iteration mirrored every LaborEntry into a 1-to-1
 * AccountingExpense row (category MAIN_DOEUVRE, sourceType LABOR). The client
 * reversed that decision — labor must stay separate from the accountant's
 * monthly view. Only Purchase and Repair flow into Accounting now.
 *
 * The schema artifacts (`AccountingSourceType.LABOR`, `accounting_expenses.laborId`
 * FK, `LaborEntry.accountingExpense` back-relation, `ExpenseCategory.MAIN_DOEUVRE`)
 * are kept on the DB side to avoid a breaking migration, but the application
 * never writes through them anymore. The cleanup migration that ships with
 * this change purges any LABOR-sourced rows the previous version wrote.
 *
 * Financial-report labor cost is still surfaced — but it's now aggregated
 * directly from `LaborEntry.totalAmount` (see financial-reports.service.ts).
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface LaborEntryPayload {
  id: string;
  branchId: string;
  date: string;
  employeeName: string;
  role: string | null;
  hours: string;
  hourlyRate: string;
  totalAmount: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function serialize(row: LaborEntry): LaborEntryPayload {
  return {
    id: row.id,
    branchId: row.branchId,
    date: row.date.toISOString().slice(0, 10),
    employeeName: row.employeeName,
    role: row.role,
    hours: row.hours.toString(),
    hourlyRate: row.hourlyRate.toString(),
    totalAmount: row.totalAmount.toString(),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class LaborService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Always recomputed server-side. Frontend can preview but never authoritative.
   * total = hours × hourlyRate (rounded to cents).
   */
  private computeTotal(hours: number, hourlyRate: number): Prisma.Decimal {
    return new Prisma.Decimal(round2(hours * hourlyRate));
  }

  async findAll(q: ListLaborEntriesDto, user?: RequestUser): Promise<LaborEntryPayload[]> {
    const scope = resolveBranchScope(user, q.branchId);
    const where: Prisma.LaborEntryWhereInput = {};
    if (scope) where.branchId = scope;
    if (q.month && q.year) {
      const start = monthStartUTC(q.year, q.month);
      const end = monthEndExclusiveUTC(q.year, q.month);
      where.date = { gte: start, lt: end };
    }
    const rows = await this.prisma.laborEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(serialize);
  }

  async findOne(id: string): Promise<LaborEntryPayload> {
    const row = await this.prisma.laborEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Saisie main-d\'œuvre introuvable');
    return serialize(row);
  }

  async summary(month: number, year: number, user?: RequestUser, branchIdParam?: string) {
    const scope = resolveBranchScope(user, branchIdParam ?? null);
    const start = monthStartUTC(year, month);
    const end = monthEndExclusiveUTC(year, month);
    const where: Prisma.LaborEntryWhereInput = { date: { gte: start, lt: end } };
    if (scope) where.branchId = scope;

    const rows = await this.prisma.laborEntry.findMany({ where, select: { employeeName: true, hours: true, totalAmount: true } });
    const totalHours = rows.reduce((s, r) => s + Number(r.hours), 0);
    const totalAmount = rows.reduce((s, r) => s + Number(r.totalAmount), 0);
    const employees = new Set(rows.map((r) => r.employeeName.toLowerCase()));
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return {
      selectedPeriod: `${months[month - 1]} ${year}`,
      totalHours: round2(totalHours),
      totalAmount: round2(totalAmount),
      entriesCount: rows.length,
      employeeCount: employees.size,
    };
  }

  async create(dto: CreateLaborEntryDto, user?: RequestUser): Promise<LaborEntryPayload> {
    const branchId = resolveBranchForMutation(user, dto.branchId);
    const total = this.computeTotal(dto.hours, dto.hourlyRate);
    const row = await this.prisma.laborEntry.create({
      data: {
        branchId,
        date: dto.date,
        employeeName: dto.employeeName.trim(),
        role: dto.role?.trim() || null,
        hours: new Prisma.Decimal(dto.hours),
        hourlyRate: new Prisma.Decimal(dto.hourlyRate),
        totalAmount: total,
        notes: dto.notes?.trim() || null,
      },
    });
    return serialize(row);
  }

  async update(id: string, dto: UpdateLaborEntryDto): Promise<LaborEntryPayload> {
    const existing = await this.prisma.laborEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Saisie main-d\'œuvre introuvable');

    const hours = dto.hours ?? Number(existing.hours.toString());
    const hourlyRate = dto.hourlyRate ?? Number(existing.hourlyRate.toString());

    const row = await this.prisma.laborEntry.update({
      where: { id },
      data: {
        ...(dto.date && { date: dto.date }),
        ...(dto.employeeName !== undefined && { employeeName: dto.employeeName.trim() }),
        ...(dto.role !== undefined && { role: dto.role?.trim() || null }),
        ...(dto.hours !== undefined && { hours: new Prisma.Decimal(dto.hours) }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: new Prisma.Decimal(dto.hourlyRate) }),
        totalAmount: this.computeTotal(hours, hourlyRate),
        ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
      },
    });
    return serialize(row);
  }

  async remove(id: string): Promise<{ success: true }> {
    await this.findOne(id);
    await this.prisma.laborEntry.delete({ where: { id } });
    return { success: true };
  }
}
