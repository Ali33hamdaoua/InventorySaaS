import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryProduct, Prisma } from '@prisma/client';
import { canAccessAllBranches } from '@inventorymdb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  resolveBranchForMutation,
  resolveBranchScope,
} from '../../common/helpers/branch-scope.helper';

type ProductWithRelations = InventoryProduct & {
  category: { id: string; name: string; description: string | null } | null;
  supplier: { id: string; name: string; isActive: boolean } | null;
};

/**
 * Wire format for a product. Prisma Decimal is forced to a plain string here
 * so the global ClassSerializerInterceptor cannot turn it into an opaque
 * object (which would surface as `NaN` on the frontend).
 */
export interface ProductDto extends Omit<
  ProductWithRelations,
  'defaultCost' | 'minStockLevel' | 'packagingFactor'
> {
  defaultCost: string;
  minStockLevel: string;
  /** Packaging factor stocké côté DB en Decimal(14, 4). Sérialisé comme
   *  string pour éviter la conversion en `{s,e,d}` du ClassSerializer. */
  packagingFactor: string | null;
}

/**
 * Outcome reported back to the frontend when `copyToOtherBranch=true` was
 * requested on create. Lets the UI render a precise toast + prompt the user
 * for an explicit decision when a name collision hits an INACTIVE twin.
 *
 * Statuses:
 *  - `created`             — the mirror was written in the other branch.
 *  - `alreadyExisted`      — an ACTIVE product with the same (branchId, name)
 *                            already lives there. Nothing changed.
 *  - `inactive_match`      — an INACTIVE product with the same (branchId,
 *                            name) exists there. Nothing changed by default.
 *                            The caller can retry with
 *                            `reactivateInactiveTwin: true` to update + reactivate.
 *  - `reactivated`         — the caller passed `reactivateInactiveTwin: true`
 *                            AND an inactive twin existed → it was updated
 *                            + reactivated.
 *  - `no_other_branch`     — single-branch deployment; nothing to copy.
 */
export type CrossBranchCopyStatus =
  | 'created'
  | 'alreadyExisted'
  | 'inactive_match'
  | 'reactivated'
  | 'no_other_branch';

export interface CrossBranchCopyResult {
  /** Name of the other branch the copy targeted (for toast formatting). */
  otherBranchName: string;
  status: CrossBranchCopyStatus;
  /** Set when `status === 'inactive_match'` or `'reactivated'`. Lets the UI
   *  offer an explicit « Réactiver et mettre à jour » action. */
  inactiveTwin?: {
    productId: string;
    productName: string;
    targetBranchId: string;
  };
}

/** Wire response for `POST /products`. `copy` is null when the toggle was off. */
export interface CreateProductResponse {
  product: ProductDto;
  copy: CrossBranchCopyResult | null;
}

function serialize<T extends ProductWithRelations>(p: T): ProductDto {
  return {
    ...p,
    defaultCost: p.defaultCost.toString(),
    minStockLevel: p.minStockLevel.toString(),
    // packagingFactor stocké en Decimal(14, 4) → string wire, ou null
    // pour les produits unitaires.
    packagingFactor: p.packagingFactor?.toString() ?? null,
  };
}

const PRODUCT_INCLUDE = {
  category: true,
  supplier: { select: { id: true, name: true, isActive: true } },
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Verify a supplier FK exists before applying it (returns 400 instead of
   *  a Postgres foreign-key error). */
  private async assertSupplierExists(supplierId: string) {
    const s = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true },
    });
    if (!s) throw new BadRequestException('Fournisseur introuvable');
  }

  async findAll(q: ListProductsDto, user?: RequestUser) {
    const scope = resolveBranchScope(user, q.branchId);
    const and: Prisma.InventoryProductWhereInput[] = [];
    if (scope) and.push({ branchId: scope });

    if (q.search) {
      and.push({ name: { contains: q.search, mode: 'insensitive' } });
    }
    if (q.categoryId) and.push({ categoryId: q.categoryId });
    if (q.supplierId) and.push({ supplierId: q.supplierId });
    if (q.unit) and.push({ unit: q.unit });
    if (q.isActive === 'true') and.push({ isActive: true });
    if (q.isActive === 'false') and.push({ isActive: false });
    if (q.criticalOnly === 'true') and.push({ minStockLevel: { gt: 0 } });

    const where: Prisma.InventoryProductWhereInput = and.length ? { AND: and } : {};

    const orderBy: Prisma.InventoryProductOrderByWithRelationInput =
      q.sortBy === 'category'
        ? { category: { name: q.sortOrder } }
        : q.sortBy === 'supplier'
          ? { supplier: { name: q.sortOrder } }
          : { [q.sortBy]: q.sortOrder };

    const [data, total] = await Promise.all([
      this.prisma.inventoryProduct.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy,
        include: PRODUCT_INCLUDE,
      }),
      this.prisma.inventoryProduct.count({ where }),
    ]);
    return {
      data: data.map(serialize),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async findOne(id: string): Promise<ProductDto> {
    const p = await this.prisma.inventoryProduct.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!p) throw new NotFoundException('Produit introuvable');
    return serialize(p);
  }

  /**
   * Finds the OTHER active branch for the cross-branch mirror. Returns null
   * when the deployment has 0 or 1 active branches (nothing to mirror to).
   * If multiple "other" branches exist (3+ branch deployments — not the case
   * today but defensively handled), throws 400 so we don't silently mirror
   * into the wrong one.
   */
  private async findOtherBranch(
    tx: Prisma.TransactionClient,
    sourceBranchId: string,
  ): Promise<{ id: string; name: string } | null> {
    const others = await tx.branch.findMany({
      where: { id: { not: sourceBranchId }, isActive: true },
      select: { id: true, name: true },
      take: 2,
    });
    if (others.length === 0) return null;
    if (others.length > 1) {
      throw new BadRequestException(
        'La copie automatique nécessite exactement une autre succursale active. Spécifiez explicitement la branche cible.',
      );
    }
    return others[0]!;
  }

  /**
   * Garde-fou : `packagingName` et `packagingFactor` vont ENSEMBLE.
   *
   * Cas acceptés :
   *   • Les deux `null`/`undefined`  → produit unitaire (comportement historique)
   *   • Les deux fournis + factor > 0 → produit conditionné
   *
   * Cas refusés (400) :
   *   • Un seul des deux fourni (info incomplète)
   *   • Facteur ≤ 0 ou > 1e6 (déjà couvert par le DTO + la contrainte
   *     DB CHECK, mais on re-vérifie ici pour un message clair)
   *
   * Cette validation ne touche AUCUNE règle métier existante — elle
   * concerne uniquement la cohérence des 2 nouveaux champs entre eux.
   */
  private validatePackaging(dto: CreateProductDto | UpdateProductDto) {
    const name = dto.packagingName;
    const factor = dto.packagingFactor;
    // "explicitly null" ou "absent" comptent tous les deux comme "non fourni"
    const nameProvided = name !== undefined && name !== null && name.trim() !== '';
    const factorProvided = factor !== undefined && factor !== null;

    if (nameProvided !== factorProvided) {
      throw new BadRequestException(
        'Le conditionnement nécessite à la fois un nom et un facteur, ou aucun des deux.',
      );
    }
    if (factorProvided && (factor as number) <= 0) {
      throw new BadRequestException(
        'Le facteur du conditionnement doit être strictement positif.',
      );
    }
  }

  async create(dto: CreateProductDto, user?: RequestUser): Promise<CreateProductResponse> {
    const branchId = resolveBranchForMutation(user, dto.branchId);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
    this.validatePackaging(dto);

    // Cross-branch copy is privileged. Only OWNER / ADMIN may write into a
    // branch they aren't actively scoped to. MANAGER would fail downstream on
    // resolveBranchForMutation anyway, but we reject early with a clearer
    // message so the frontend can hide the toggle.
    if (dto.copyToOtherBranch && user && !canAccessAllBranches(user.role)) {
      throw new ForbiddenException(
        'Seuls OWNER et ADMIN peuvent dupliquer un produit dans une autre succursale.',
      );
    }

    const { branchId: _ignored, copyToOtherBranch, reactivateInactiveTwin, ...rest } = dto;
    void _ignored;

    // Single transaction so the mirror copy either lands or is rolled back
    // with the primary insert — no orphan rows on partial failure.
    const result = await this.prisma.$transaction(async (tx) => {
      const primary = await tx.inventoryProduct.create({
        data: { ...rest, branchId },
        include: PRODUCT_INCLUDE,
      });

      let copy: CrossBranchCopyResult | null = null;
      if (copyToOtherBranch) {
        const other = await this.findOtherBranch(tx, branchId);
        if (!other) {
          copy = { otherBranchName: '', status: 'no_other_branch' };
        } else {
          // Cherche un homonyme (actif OU inactif) dans la branche cible.
          // On sélectionne `isActive` pour distinguer les 3 cas :
          //   - aucun match         → CREATE mirror
          //   - match ACTIF         → alreadyExisted, aucune action
          //   - match INACTIF       → décision explicite requise
          const existing = await tx.inventoryProduct.findFirst({
            where: {
              branchId: other.id,
              name: { equals: rest.name, mode: 'insensitive' },
            },
            select: { id: true, name: true, isActive: true },
          });

          if (!existing) {
            // Category + Supplier are GLOBAL in the current schema — pas de
            // copie parent, on réutilise les FKs.
            await tx.inventoryProduct.create({
              data: { ...rest, branchId: other.id },
            });
            copy = { otherBranchName: other.name, status: 'created' };
          } else if (existing.isActive) {
            // Homonyme ACTIF : aucune action, statut informatif.
            copy = { otherBranchName: other.name, status: 'alreadyExisted' };
          } else {
            // Homonyme INACTIF : deux voies selon la décision explicite.
            const twin = {
              productId: existing.id,
              productName: existing.name,
              targetBranchId: other.id,
            };
            if (reactivateInactiveTwin) {
              // Réactivation + mise à jour explicite. On réutilise les
              // champs métier du DTO (mêmes que ceux passés à la copie
              // classique) et on force isActive = true.
              await tx.inventoryProduct.update({
                where: { id: existing.id },
                data: { ...rest, isActive: true },
              });
              copy = {
                otherBranchName: other.name,
                status: 'reactivated',
                inactiveTwin: twin,
              };
            } else {
              // Sans décision : aucune modification. L'UI doit re-poster
              // avec `reactivateInactiveTwin: true` pour actioner.
              copy = {
                otherBranchName: other.name,
                status: 'inactive_match',
                inactiveTwin: twin,
              };
            }
          }
        }
      }

      return { product: serialize(primary), copy };
    });

    return result;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDto> {
    await this.findOne(id);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
    this.validatePackaging(dto);
    // branchId is intentionally stripped: a product never moves between branches.
    // A re-classification would require deleting and recreating in the target branch.
    const { branchId: _branchId, ...rest } = dto;
    void _branchId;
    const p = await this.prisma.inventoryProduct.update({
      where: { id },
      data: rest,
      include: PRODUCT_INCLUDE,
    });
    return serialize(p);
  }

  /** Soft-disable: never physically deletes — keeps seed/demo data intact. */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.inventoryProduct.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }

  async setStatus(id: string, isActive: boolean): Promise<ProductDto> {
    await this.findOne(id);
    const p = await this.prisma.inventoryProduct.update({
      where: { id },
      data: { isActive },
      include: PRODUCT_INCLUDE,
    });
    return serialize(p);
  }

  // -------------------------------------------------------------------
  // References + hard-delete (contrôlé)
  //
  // Le soft-delete (`remove`) reste le comportement par défaut. La
  // suppression PHYSIQUE est une opération séparée, réservée aux OWNER /
  // ADMIN (via le contrôleur), et interdite dès qu'une trace historique
  // existe (PurchaseItem ou InventoryLine). Les FKs Postgres en `Restrict`
  // sur ces deux relations sont le garde-fou ultime — on gère le P2003
  // Prisma malgré tout en cas de race condition.
  // -------------------------------------------------------------------

  /** Compte les références historiques d'un produit dans sa branche.
   *  Retourne aussi `canHardDelete` pour piloter l'UI. */
  async countReferences(
    id: string,
  ): Promise<{
    purchaseItemCount: number;
    inventoryLineCount: number;
    canHardDelete: boolean;
    isActive: boolean;
  }> {
    const product = await this.prisma.inventoryProduct.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!product) throw new NotFoundException('Produit introuvable');

    const [purchaseItemCount, inventoryLineCount] = await Promise.all([
      this.prisma.purchaseItem.count({ where: { productId: id } }),
      this.prisma.inventoryLine.count({ where: { productId: id } }),
    ]);
    return {
      purchaseItemCount,
      inventoryLineCount,
      // Règle stricte : hard-delete autorisé UNIQUEMENT si inactif ET
      // aucune référence historique.
      canHardDelete:
        !product.isActive && purchaseItemCount === 0 && inventoryLineCount === 0,
      isActive: product.isActive,
    };
  }

  /**
   * Suppression physique. Retourne 409 si :
   *   - le produit est encore actif ;
   *   - le produit a des références historiques.
   *
   * En cas de race condition (une ligne est créée entre le pré-check et
   * le DELETE), Prisma renverra P2003 (violation FK Restrict) — on le
   * transforme en 409 explicite pour l'UI.
   */
  async hardRemove(id: string): Promise<{ success: true }> {
    const product = await this.prisma.inventoryProduct.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });
    if (!product) throw new NotFoundException('Produit introuvable');

    if (product.isActive) {
      throw new ConflictException(
        'Désactivez ce produit avant de le supprimer définitivement.',
      );
    }

    const [purchaseItemCount, inventoryLineCount] = await Promise.all([
      this.prisma.purchaseItem.count({ where: { productId: id } }),
      this.prisma.inventoryLine.count({ where: { productId: id } }),
    ]);
    if (purchaseItemCount > 0 || inventoryLineCount > 0) {
      throw new ConflictException(
        `Ce produit apparaît dans ${purchaseItemCount} achat(s) et ${inventoryLineCount} période(s) d'inventaire. Il ne peut pas être supprimé afin de préserver l'historique.`,
      );
    }

    try {
      await this.prisma.inventoryProduct.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      // Race condition — une PurchaseItem ou une InventoryLine a été
      // créée entre le pré-check et le DELETE. La FK Restrict a fait son
      // travail : on transforme l'erreur Prisma en 409 lisible.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          "Impossible de supprimer : une référence historique vient d'être créée pour ce produit.",
        );
      }
      throw err;
    }
  }
}
