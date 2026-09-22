import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Branch } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false): Promise<Branch[]> {
    return this.prisma.branch.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Same as findAll() but enriches each row with usage counters (users,
   * products, purchases). Used by the Settings page.
   */
  async findAllWithStats(includeInactive = false) {
    const branches = await this.prisma.branch.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { users: true, products: true, purchases: true },
        },
      },
    });
    return branches.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      address: b.address,
      isActive: b.isActive,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      usersCount: b._count.users,
      productsCount: b._count.products,
      purchasesCount: b._count.purchases,
    }));
  }

  async findOne(id: string): Promise<Branch> {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Succursale introuvable');
    return branch;
  }

  async findBySlug(slug: string): Promise<Branch> {
    const branch = await this.prisma.branch.findUnique({ where: { slug } });
    if (!branch) throw new NotFoundException('Succursale introuvable');
    return branch;
  }

  async create(dto: CreateBranchDto): Promise<Branch> {
    const existing = await this.prisma.branch.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new BadRequestException(`Une succursale avec le slug "${dto.slug}" existe déjà`);
    }
    return this.prisma.branch.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        address: dto.address ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateBranchDto): Promise<Branch> {
    await this.findOne(id);
    if (dto.slug) {
      const conflict = await this.prisma.branch.findUnique({ where: { slug: dto.slug } });
      if (conflict && conflict.id !== id) {
        throw new BadRequestException(`Une autre succursale utilise déjà le slug "${dto.slug}"`);
      }
    }
    return this.prisma.branch.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.slug && { slug: dto.slug }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  /** Soft toggle — flip isActive. Branches are never hard-deleted because
   *  every product/purchase/period would lose its FK. */
  async setActive(id: string, isActive: boolean): Promise<Branch> {
    await this.findOne(id);
    return this.prisma.branch.update({ where: { id }, data: { isActive } });
  }
}
