import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountingCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AccountingCategoryDto {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function serialize(row: AccountingCategory): AccountingCategoryDto {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `accounting_categories` is intentionally GLOBAL (no branchId). Categories
 * are reused across the whole business (Joliette + Bishop) so the dropdown
 * stays consistent between branches — same product types of expense, same
 * label.
 *
 * The trim + insensitive dedup logic lives in `findOrCreate`. Every code
 * path that needs to attach a category to an expense (manual form, auto
 * sync from Purchase/Repair) goes through it.
 */
@Injectable()
export class AccountingCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns ACTIVE categories only. Inactive ones (the seeded "Autres" row,
   * for instance — explicitly hidden per client request because the bucket
   * was too generic) stay in the DB so existing expenses linked to them
   * keep displaying their name in the accounting table, but the dropdown
   * and filter pickers never show them again.
   */
  async findAll(): Promise<AccountingCategoryDto[]> {
    const rows = await this.prisma.accountingCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(serialize);
  }

  /**
   * Find an existing category by case-insensitive trimmed name, or create
   * it on the fly. Idempotent — concurrent calls with the same name race-
   * safely converge on the same row thanks to the unique constraint.
   *
   * Trims whitespace and rejects empty / overly long names early so we
   * never persist garbage like "  " or 500-char strings.
   *
   * Accepts the Prisma TransactionClient so the caller can do this inside
   * a larger transaction (e.g. creating an expense + its category in one
   * atomic step).
   */
  async findOrCreate(
    rawName: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingCategoryDto> {
    const client = tx ?? this.prisma;
    const name = rawName?.trim();
    if (!name) {
      throw new BadRequestException('La catégorie est requise.');
    }
    if (name.length > 120) {
      throw new BadRequestException('Le nom de catégorie est trop long (max 120 caractères).');
    }

    // Case-insensitive match — keeps "Marketing" / "marketing" / " MARKETING "
    // from creating three separate rows.
    const existing = await client.accountingCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return serialize(existing);

    try {
      const created = await client.accountingCategory.create({
        data: { name },
      });
      return serialize(created);
    } catch (e) {
      // Race condition: another request created the same name between our
      // findFirst and our create. Re-fetch and return the existing row.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const racing = await client.accountingCategory.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (racing) return serialize(racing);
      }
      throw e;
    }
  }
}
