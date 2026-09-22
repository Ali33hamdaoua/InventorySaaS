import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Supplier } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';

export interface SupplierDto extends Supplier {
  purchasesCount?: number;
  totalPurchasedAmount?: string;
  lastPurchaseDate?: string | null;
}

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Loads aggregates for a set of supplier IDs in two cheap queries. */
  private async loadStats(supplierIds: string[]) {
    if (supplierIds.length === 0) {
      return new Map<string, { count: number; total: Prisma.Decimal; last: Date | null }>();
    }
    const [counts, lasts] = await Promise.all([
      this.prisma.purchase.groupBy({
        by: ['supplierId'],
        where: { supplierId: { in: supplierIds } },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.purchase.groupBy({
        by: ['supplierId'],
        where: { supplierId: { in: supplierIds } },
        _max: { purchaseDate: true },
      }),
    ]);

    const lastBy = new Map(lasts.map((l) => [l.supplierId, l._max.purchaseDate ?? null]));
    const stats = new Map<string, { count: number; total: Prisma.Decimal; last: Date | null }>();
    for (const c of counts) {
      stats.set(c.supplierId, {
        count: c._count._all,
        total: c._sum.totalAmount ?? new Prisma.Decimal(0),
        last: lastBy.get(c.supplierId) ?? null,
      });
    }
    return stats;
  }

  private withStats(
    s: Supplier,
    stats: Map<string, { count: number; total: Prisma.Decimal; last: Date | null }>,
  ): SupplierDto {
    const row = stats.get(s.id);
    return {
      ...s,
      purchasesCount: row?.count ?? 0,
      totalPurchasedAmount: (row?.total ?? new Prisma.Decimal(0)).toString(),
      lastPurchaseDate: row?.last ? row.last.toISOString() : null,
    };
  }

  async findAll(q: ListSuppliersDto): Promise<SupplierDto[]> {
    const and: Prisma.SupplierWhereInput[] = [];
    if (q.search) {
      const s = q.search;
      and.push({
        OR: [
          { name: { contains: s, mode: 'insensitive' } },
          { email: { contains: s, mode: 'insensitive' } },
          { phone: { contains: s, mode: 'insensitive' } },
          { contactName: { contains: s, mode: 'insensitive' } },
        ],
      });
    }
    if (q.isActive === 'true') and.push({ isActive: true });
    if (q.isActive === 'false') and.push({ isActive: false });

    const rows = await this.prisma.supplier.findMany({
      where: and.length ? { AND: and } : {},
      orderBy: { name: 'asc' },
    });

    if (q.includeStats !== 'true') return rows;
    const stats = await this.loadStats(rows.map((r) => r.id));
    return rows.map((r) => this.withStats(r, stats));
  }

  async findOne(id: string): Promise<SupplierDto> {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Fournisseur introuvable');
    const stats = await this.loadStats([id]);
    return this.withStats(s, stats);
  }

  async create(dto: CreateSupplierDto): Promise<SupplierDto> {
    const s = await this.prisma.supplier.create({
      data: {
        name: dto.name,
        contactName: dto.contactName ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        address: dto.address ?? null,
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    return { ...s, purchasesCount: 0, totalPurchasedAmount: '0', lastPurchaseDate: null };
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierDto> {
    await this.findOne(id);
    const s = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.contactName !== undefined && { contactName: dto.contactName ?? null }),
        ...(dto.phone !== undefined && { phone: dto.phone ?? null }),
        ...(dto.email !== undefined && { email: dto.email ?? null }),
        ...(dto.address !== undefined && { address: dto.address ?? null }),
        ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    const stats = await this.loadStats([id]);
    return this.withStats(s, stats);
  }

  async setStatus(id: string, isActive: boolean): Promise<SupplierDto> {
    await this.findOne(id);
    const s = await this.prisma.supplier.update({ where: { id }, data: { isActive } });
    const stats = await this.loadStats([id]);
    return this.withStats(s, stats);
  }

  /**
   * Soft-delete only. Refuses physical DELETE if any purchase is still
   * linked — preserves Maison Burger demo history.
   */
  async remove(id: string) {
    const s = await this.findOne(id);
    if (s.purchasesCount && s.purchasesCount > 0) {
      throw new BadRequestException(
        `Suppression refusée : ${s.purchasesCount} achat(s) sont liés à ce fournisseur. Désactivez-le pour conserver l'historique.`,
      );
    }
    await this.prisma.supplier.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }
}
