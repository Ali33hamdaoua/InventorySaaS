import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PeriodStatus, Prisma, StockTransferStatus } from '@prisma/client';
import { canAccessAllBranches } from '@inventorymdb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { monthStartUTC, monthEndExclusiveUTC } from '../../common/helpers/business-date.helper';
import { computeAvailableQuantity } from '../../common/helpers/inventory-math.helper';

@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async transfer(dto: CreateStockTransferDto, user: RequestUser) {
    if (dto.quantity <= 0) {
      throw new BadRequestException('La quantité transférée doit être strictement positive.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Produit source — c'est LUI qui détermine la succursale d'origine.
      //    Un produit appartient à une seule succursale, donc `fromBranchId`
      //    est déductible : le client n'a pas besoin de l'envoyer.
      const sourceProduct = await tx.inventoryProduct.findUnique({
        where: { id: dto.productId },
      });
      if (!sourceProduct) {
        throw new NotFoundException('Produit source introuvable.');
      }
      if (!sourceProduct.isActive) {
        throw new BadRequestException('Le produit source est inactif.');
      }

      const fromBranchId = dto.fromBranchId ?? sourceProduct.branchId;

      // Si le client a été explicite, la valeur envoyée doit être cohérente
      // avec la succursale réelle du produit.
      if (dto.fromBranchId && sourceProduct.branchId !== dto.fromBranchId) {
        throw new BadRequestException("Le produit source n'appartient pas à la succursale source.");
      }

      if (fromBranchId === dto.toBranchId) {
        throw new BadRequestException('La succursale source et destination doivent être différentes.');
      }

      // Un utilisateur scopé (MANAGER) ne peut sortir du stock que de SA
      // succursale — sans ce contrôle il pouvait vider n'importe quelle branche.
      if (!canAccessAllBranches(user.role) && user.branchId !== fromBranchId) {
        throw new ForbiddenException(
          "Vous ne pouvez transférer que depuis votre propre succursale.",
        );
      }

      // 2. Vérifier l'existence et l'état des succursales
      const branches = await tx.branch.findMany({
        where: { id: { in: [fromBranchId, dto.toBranchId] } },
      });
      if (branches.length !== 2) {
        throw new NotFoundException('Une des succursales est introuvable.');
      }
      const sourceBranch = branches.find((b) => b.id === fromBranchId);
      const destBranch = branches.find((b) => b.id === dto.toBranchId);
      if (!sourceBranch?.isActive || !destBranch?.isActive) {
        throw new BadRequestException('Les succursales impliquées doivent être actives.');
      }

      // 3. Vérifier que chaque succursale a une période OPEN
      const [sourcePeriod, destPeriod] = await Promise.all([
        tx.inventoryPeriod.findFirst({
          where: { branchId: fromBranchId, status: PeriodStatus.OPEN },
        }),
        tx.inventoryPeriod.findFirst({
          where: { branchId: dto.toBranchId, status: PeriodStatus.OPEN },
        }),
      ]);

      if (!sourcePeriod) {
        throw new BadRequestException('La succursale source n\'a pas de période d\'inventaire ouverte.');
      }
      if (!destPeriod) {
        throw new BadRequestException('La succursale destination n\'a pas de période d\'inventaire ouverte.');
      }

      // 4. Identifier le produit destination par son nom
      const destProduct = await tx.inventoryProduct.findFirst({
        where: {
          branchId: dto.toBranchId,
          name: {
            equals: sourceProduct.name,
            mode: 'insensitive',
          },
        },
      });

      if (!destProduct) {
        throw new BadRequestException(
          `Le produit "${sourceProduct.name}" n'existe pas dans la succursale destination. ` +
          `Veuillez d'abord le créer ou le dupliquer côté destination.`
        );
      }
      if (!destProduct.isActive) {
        throw new BadRequestException(`Le produit "${destProduct.name}" est inactif dans la succursale destination.`);
      }

      // 5. Verrouillage de la ligne source via SELECT ... FOR UPDATE
      const lockedLines = await tx.$queryRaw<{ 
        id: string; 
        openingQuantity: string | number | Prisma.Decimal;
        transferInQuantity: string | number | Prisma.Decimal;
        transferOutQuantity: string | number | Prisma.Decimal;
        closingUnitCost: string | number | Prisma.Decimal;
      }[]>`
        SELECT id, "openingQuantity", "transferInQuantity", "transferOutQuantity", "closingUnitCost"
        FROM "inventory_lines" 
        WHERE "periodId" = ${sourcePeriod.id}::uuid 
          AND "productId" = ${sourceProduct.id}::uuid 
        FOR UPDATE
      `;

      if (lockedLines.length === 0) {
        throw new BadRequestException('Ligne d\'inventaire introuvable pour ce produit dans la période courante (source).');
      }

      const rawSourceLine = lockedLines[0];
      const sourceLine = {
        id: rawSourceLine.id,
        openingQuantity: new Prisma.Decimal(rawSourceLine.openingQuantity?.toString() || 0),
        transferInQuantity: new Prisma.Decimal(rawSourceLine.transferInQuantity?.toString() || 0),
        transferOutQuantity: new Prisma.Decimal(rawSourceLine.transferOutQuantity?.toString() || 0),
        closingUnitCost: new Prisma.Decimal(rawSourceLine.closingUnitCost?.toString() || 0),
      };

      // Calcul des achats dynamiques (puisque la ligne est OPEN, purchasesQuantity n'est pas encore figé)
      const start = monthStartUTC(sourcePeriod.year, sourcePeriod.month);
      const end = monthEndExclusiveUTC(sourcePeriod.year, sourcePeriod.month);

      const purchaseAgg = await tx.purchaseItem.aggregate({
        where: {
          productId: sourceProduct.id,
          purchase: {
            branchId: fromBranchId,
            purchaseDate: { gte: start, lt: end },
          },
        },
        _sum: { quantity: true },
      });
      const purchasesQuantity = purchaseAgg._sum.quantity || new Prisma.Decimal(0);

      const availableQuantity = computeAvailableQuantity({
        opening: sourceLine.openingQuantity,
        purchases: purchasesQuantity,
        transferIn: sourceLine.transferInQuantity,
        transferOut: sourceLine.transferOutQuantity,
      });

      if (availableQuantity.lessThan(dto.quantity)) {
        throw new ConflictException(
          `Quantité insuffisante. Disponible: ${availableQuantity.toString()}, Demandé: ${dto.quantity}`
        );
      }

      // 6. Mise à jour de la ligne source (seulement transferOut, plus de double décrément avec closingQuantity)
      await tx.inventoryLine.update({
        where: { id: sourceLine.id },
        data: {
          transferOutQuantity: { increment: dto.quantity },
        },
      });

      // 7. Mise à jour ou création de la ligne destination
      await tx.inventoryLine.upsert({
        where: {
          periodId_productId: {
            periodId: destPeriod.id,
            productId: destProduct.id,
          },
        },
        create: {
          periodId: destPeriod.id,
          productId: destProduct.id,
          openingQuantity: 0,
          closingQuantity: 0,
          openingUnitCost: destProduct.defaultCost,
          closingUnitCost: destProduct.defaultCost,
          transferInQuantity: dto.quantity,
          transferOutQuantity: 0,
        },
        update: {
          transferInQuantity: { increment: dto.quantity },
        },
      });

      // 8. Enregistrer le transfert pour historique
      const transfer = await tx.stockTransfer.create({
        data: {
          fromBranchId,
          toBranchId: dto.toBranchId,
          status: StockTransferStatus.COMPLETED,
          createdById: user.id,
          note: dto.note,
          items: {
            create: {
              sourceProductId: sourceProduct.id,
              targetProductId: destProduct.id,
              quantity: dto.quantity,
              // `Prisma.Decimal(0)` est TRUTHY : un `||` ne serait jamais
              // declenche et l'historique enregistrerait un cout nul. On teste
              // explicitement, et on retombe sur le cout du produit SOURCE.
              unitCost: sourceLine.closingUnitCost.isZero()
                ? sourceProduct.defaultCost
                : sourceLine.closingUnitCost,
            }
          }
        },
        include: { items: true },
      });

      // 9. Créer un log d'audit
      await tx.auditLog.create({
        data: {
          action: 'STOCK_TRANSFER',
          entity: 'StockTransfer',
          entityId: transfer.id,
          userId: user.id,
          newValue: {
            fromBranchId,
            toBranchId: dto.toBranchId,
            sourceProductId: sourceProduct.id,
            destProductId: destProduct.id,
            productName: sourceProduct.name,
            quantity: dto.quantity,
          },
        },
      });

      return transfer;
    }, { timeout: 15_000, maxWait: 5_000 });
  }

  /**
   * Historique des transferts.
   *
   * Les `Decimal` sont sérialisés en chaînes sur le fil pour esquiver le
   * `ClassSerializerInterceptor` global, qui aplatit un `Prisma.Decimal` en
   * `{ s, e, d }` — ce que le frontend lit ensuite comme `NaN`. Même idiome
   * que `InventoryLinesService.findByPeriod`.
   */
  async findAll(user: RequestUser) {
    // If the user is assigned to a branch, only show transfers involving that branch
    const where = user.branchId ? {
      OR: [
        { fromBranchId: user.branchId },
        { toBranchId: user.branchId },
      ]
    } : {};

    const transfers = await this.prisma.stockTransfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            sourceProduct: {
              select: {
                id: true,
                name: true,
                unit: true,
              }
            }
          }
        },
      }
    });

    return transfers.map((t) => ({
      ...t,
      items: t.items.map((i) => ({
        ...i,
        quantity: i.quantity.toString(),
        unitCost: i.unitCost.toString(),
      })),
    }));
  }
}
