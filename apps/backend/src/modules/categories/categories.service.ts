import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, CategoryType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';

/** Wire format for the frontend. Adds an optional productCount and keeps
 *  description nullable for clean JSON. */
export interface CategoryDto extends Category {
  productCount?: number;
}

function serialize(c: Category & { _count?: { products: number } }): CategoryDto {
  const { _count, ...rest } = c;
  return _count ? { ...rest, productCount: _count.products } : rest;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: ListCategoriesDto): Promise<CategoryDto[]> {
    const and: Prisma.CategoryWhereInput[] = [];
    if (q.search) {
      and.push({ name: { contains: q.search, mode: 'insensitive' } });
    }
    if (q.categoryType) and.push({ categoryType: q.categoryType });
    if (q.isActive === 'true') and.push({ isActive: true });
    if (q.isActive === 'false') and.push({ isActive: false });

    const includeCount = q.includeProductCount !== 'false';

    const rows = await this.prisma.category.findMany({
      where: and.length ? { AND: and } : {},
      orderBy: { name: 'asc' },
      include: includeCount ? { _count: { select: { products: true } } } : undefined,
    });
    return rows.map(serialize);
  }

  async findOne(id: string): Promise<CategoryDto> {
    const cat = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!cat) throw new NotFoundException('Catégorie introuvable');
    return serialize(cat);
  }

  async create(dto: CreateCategoryDto): Promise<CategoryDto> {
    try {
      const c = await this.prisma.category.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          categoryType: dto.categoryType ?? CategoryType.FOOD,
          isActive: dto.isActive ?? true,
        },
        include: { _count: { select: { products: true } } },
      });
      return serialize(c);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Une catégorie avec ce nom existe déjà');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    await this.findOne(id);
    try {
      const c = await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.categoryType !== undefined && { categoryType: dto.categoryType }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: { _count: { select: { products: true } } },
      });
      return serialize(c);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Une catégorie avec ce nom existe déjà');
      }
      throw e;
    }
  }

  async setStatus(id: string, isActive: boolean): Promise<CategoryDto> {
    await this.findOne(id);
    const c = await this.prisma.category.update({
      where: { id },
      data: { isActive },
      include: { _count: { select: { products: true } } },
    });
    return serialize(c);
  }

  /**
   * Soft-delete only. Refuses a physical DELETE if any product is still
   * linked to the category — the client must reassign or disable instead.
   * Provided for backwards-compat with the legacy DELETE route.
   */
  async remove(id: string) {
    const cat = await this.findOne(id);
    if (cat.productCount && cat.productCount > 0) {
      throw new BadRequestException(
        `Suppression refusée : ${cat.productCount} produit(s) sont liés à cette catégorie. Désactivez-la ou réassignez les produits.`,
      );
    }
    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }
}
