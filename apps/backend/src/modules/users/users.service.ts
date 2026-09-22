import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import type { RequestUser } from '../../common/decorators/current-user.decorator';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  branchId: true,
  branch: { select: { id: true, name: true, slug: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private async assertEmailUnique(email: string, excludeId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }
  }

  private async assertBranchExists(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new BadRequestException('Succursale introuvable');
  }

  /** MANAGER must have a branch; OWNER/ADMIN may have null (cross-branch). */
  private assertRoleBranchCompat(role: UserRole, branchId: string | null | undefined) {
    if (role === UserRole.MANAGER && !branchId) {
      throw new BadRequestException(
        'Un MANAGER doit être assigné à une succursale (branchId requis)',
      );
    }
  }

  /** Count OWNER users that are active. Used to protect the last one. */
  private countActiveOwners(): Promise<number> {
    return this.prisma.user.count({
      where: { role: UserRole.OWNER, isActive: true },
    });
  }

  // -------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------

  async findAll(q: ListUsersDto = {}) {
    const and: Prisma.UserWhereInput[] = [];
    if (q.search) {
      and.push({
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { email: { contains: q.search, mode: 'insensitive' } },
        ],
      });
    }
    if (q.role) and.push({ role: q.role });
    if (q.branchId) and.push({ branchId: q.branchId });
    if (q.isActive === 'true') and.push({ isActive: true });
    if (q.isActive === 'false') and.push({ isActive: false });

    return this.prisma.user.findMany({
      where: and.length ? { AND: and } : {},
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      select: USER_SELECT,
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  // -------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------

  async create(dto: CreateUserDto) {
    this.assertRoleBranchCompat(dto.role, dto.branchId ?? null);
    await this.assertEmailUnique(dto.email);
    if (dto.branchId) await this.assertBranchExists(dto.branchId);

    const passwordHash = await argon2.hash(dto.password);
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        passwordHash,
        branchId: dto.branchId ?? null,
        isActive: dto.isActive ?? true,
      },
      select: USER_SELECT,
    });
  }

  async update(id: string, dto: UpdateUserDto, currentUser?: RequestUser) {
    const existing = await this.findOne(id);

    // Compute effective role + branchId after the patch and validate.
    const effectiveRole = (dto.role ?? existing.role) as UserRole;
    const effectiveBranchId =
      dto.branchId !== undefined ? dto.branchId : existing.branchId;
    this.assertRoleBranchCompat(effectiveRole, effectiveBranchId);

    if (dto.email && dto.email !== existing.email) {
      await this.assertEmailUnique(dto.email, id);
    }
    if (dto.branchId) {
      await this.assertBranchExists(dto.branchId);
    }

    // Demoting / disabling the last active OWNER must be blocked.
    if (
      existing.role === UserRole.OWNER &&
      existing.isActive &&
      ((dto.role && dto.role !== UserRole.OWNER) || dto.isActive === false)
    ) {
      const owners = await this.countActiveOwners();
      if (owners <= 1) {
        throw new ConflictException(
          'Impossible de modifier le dernier OWNER actif (rôle ou statut)',
        );
      }
    }

    // Self-disable protection.
    if (dto.isActive === false && currentUser?.id === id) {
      throw new ForbiddenException(
        'Vous ne pouvez pas désactiver votre propre compte',
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: USER_SELECT,
    });
  }

  /** Toggle active flag. Same protections as update. */
  async setStatus(id: string, isActive: boolean, currentUser?: RequestUser) {
    const existing = await this.findOne(id);

    if (!isActive) {
      if (currentUser?.id === id) {
        throw new ForbiddenException(
          'Vous ne pouvez pas désactiver votre propre compte',
        );
      }
      if (existing.role === UserRole.OWNER && existing.isActive) {
        const owners = await this.countActiveOwners();
        if (owners <= 1) {
          throw new ConflictException(
            'Impossible de désactiver le dernier OWNER actif',
          );
        }
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: USER_SELECT,
    });
  }

  /**
   * Hard-delete a user. ADMIN-only escape hatch — prefer setStatus(false) so
   * audit logs and historical attribution stay intact.
   */
  async remove(id: string, currentUser?: RequestUser) {
    const existing = await this.findOne(id);
    if (currentUser?.id === id) {
      throw new ForbiddenException(
        'Vous ne pouvez pas supprimer votre propre compte',
      );
    }
    if (existing.role === UserRole.OWNER) {
      const owners = await this.countActiveOwners();
      if (owners <= 1) {
        throw new ConflictException(
          'Impossible de supprimer le dernier OWNER actif',
        );
      }
    }
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}
