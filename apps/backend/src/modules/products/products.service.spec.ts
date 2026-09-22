/**
 * Tests unitaires du cycle de vie Produit — Lot 1.
 *
 * Contrat testé :
 *  - Un produit créé est actif par défaut (via defaults DB — vérifié par
 *    l'absence de forçage isActive:false dans le service).
 *  - `remove` fait un soft-delete (isActive=false), jamais de DELETE.
 *  - `hardRemove` refuse un produit actif (409).
 *  - `hardRemove` refuse un produit inactif référencé dans PurchaseItem (409).
 *  - `hardRemove` refuse un produit inactif référencé dans InventoryLine (409).
 *  - `hardRemove` réussit sur un produit inactif SANS référence.
 *  - `countReferences` retourne les bons compteurs + `canHardDelete`.
 *  - Copie inter-branches : distingue actif / inactif / absent.
 *  - Copie inter-branches : `reactivateInactiveTwin=true` réactive.
 *
 * Prisma est intégralement mocké (jest-mock objects) — aucun accès DB.
 * Cela isole strictement la logique du service.
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsService } from './products.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

// ---------------------------------------------------------------
// Utils : builder d'un mock Prisma minimal + wrapper $transaction
// ---------------------------------------------------------------

type PrismaMock = {
  inventoryProduct: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  purchaseItem: {
    count: jest.Mock;
  };
  inventoryLine: {
    count: jest.Mock;
  };
  supplier: {
    findUnique: jest.Mock;
  };
  branch: {
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

function buildPrismaMock(): PrismaMock {
  const m: PrismaMock = {
    inventoryProduct: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    purchaseItem: { count: jest.fn() },
    inventoryLine: { count: jest.fn() },
    supplier: { findUnique: jest.fn() },
    branch: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  // $transaction execute directly with `m` as tx client — good enough for
  // this suite since every call inside is on tables mocked above.
  m.$transaction.mockImplementation(async (cb: (tx: PrismaMock) => unknown) => cb(m));
  return m;
}

function makeService(prisma: PrismaMock): ProductsService {
  return new ProductsService(prisma as unknown as PrismaService);
}

// Fixture "produit brut" (shape que Prisma retournerait avec PRODUCT_INCLUDE).
function productFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p-1',
    branchId: 'b-1',
    name: 'Tomates',
    unit: 'kg',
    categoryId: null,
    supplierId: null,
    defaultCost: new Prisma.Decimal(0),
    minStockLevel: new Prisma.Decimal(0),
    packagingName: null,
    packagingFactor: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: null,
    supplier: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------
// Suite : soft-delete
// ---------------------------------------------------------------

describe('ProductsService.remove (soft-delete)', () => {
  it('remove() ne fait JAMAIS de DELETE physique et met isActive=false', async () => {
    const prisma = buildPrismaMock();
    const p = productFixture({ isActive: true });
    prisma.inventoryProduct.findUnique.mockResolvedValue(p);
    prisma.inventoryProduct.update.mockResolvedValue({ ...p, isActive: false });

    const service = makeService(prisma);
    const res = await service.remove('p-1');

    expect(prisma.inventoryProduct.delete).not.toHaveBeenCalled();
    expect(prisma.inventoryProduct.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { isActive: false },
    });
    expect(res).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------
// Suite : hard-delete
// ---------------------------------------------------------------

describe('ProductsService.hardRemove', () => {
  it('refuse (409) un produit encore ACTIF', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findUnique.mockResolvedValue({
      id: 'p-1',
      name: 'X',
      isActive: true,
    });

    const service = makeService(prisma);
    await expect(service.hardRemove('p-1')).rejects.toThrow(ConflictException);
    expect(prisma.inventoryProduct.delete).not.toHaveBeenCalled();
  });

  it('refuse (409) un produit INACTIF référencé dans PurchaseItem', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findUnique.mockResolvedValue({
      id: 'p-1',
      name: 'X',
      isActive: false,
    });
    prisma.purchaseItem.count.mockResolvedValue(3);
    prisma.inventoryLine.count.mockResolvedValue(0);

    const service = makeService(prisma);
    await expect(service.hardRemove('p-1')).rejects.toThrow(ConflictException);
    expect(prisma.inventoryProduct.delete).not.toHaveBeenCalled();
  });

  it('refuse (409) un produit INACTIF référencé dans InventoryLine', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findUnique.mockResolvedValue({
      id: 'p-1',
      name: 'X',
      isActive: false,
    });
    prisma.purchaseItem.count.mockResolvedValue(0);
    prisma.inventoryLine.count.mockResolvedValue(5);

    const service = makeService(prisma);
    await expect(service.hardRemove('p-1')).rejects.toThrow(ConflictException);
    expect(prisma.inventoryProduct.delete).not.toHaveBeenCalled();
  });

  it('réussit sur un produit INACTIF SANS référence', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findUnique.mockResolvedValue({
      id: 'p-1',
      name: 'X',
      isActive: false,
    });
    prisma.purchaseItem.count.mockResolvedValue(0);
    prisma.inventoryLine.count.mockResolvedValue(0);
    prisma.inventoryProduct.delete.mockResolvedValue({ id: 'p-1' });

    const service = makeService(prisma);
    const res = await service.hardRemove('p-1');

    expect(prisma.inventoryProduct.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
    expect(res).toEqual({ success: true });
  });

  it('404 sur un id inconnu', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findUnique.mockResolvedValue(null);

    const service = makeService(prisma);
    await expect(service.hardRemove('missing')).rejects.toThrow(NotFoundException);
  });

  it('transforme P2003 (race condition FK Restrict) en 409', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findUnique.mockResolvedValue({
      id: 'p-1',
      name: 'X',
      isActive: false,
    });
    prisma.purchaseItem.count.mockResolvedValue(0);
    prisma.inventoryLine.count.mockResolvedValue(0);
    prisma.inventoryProduct.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('FK violation', {
        code: 'P2003',
        clientVersion: 'test',
      }),
    );

    const service = makeService(prisma);
    await expect(service.hardRemove('p-1')).rejects.toThrow(ConflictException);
  });
});

// ---------------------------------------------------------------
// Suite : countReferences
// ---------------------------------------------------------------

describe('ProductsService.countReferences', () => {
  it('retourne les compteurs + canHardDelete=false quand actif', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findUnique.mockResolvedValue({ id: 'p-1', isActive: true });
    prisma.purchaseItem.count.mockResolvedValue(0);
    prisma.inventoryLine.count.mockResolvedValue(0);

    const service = makeService(prisma);
    const res = await service.countReferences('p-1');
    expect(res).toEqual({
      purchaseItemCount: 0,
      inventoryLineCount: 0,
      canHardDelete: false, // actif → interdit
      isActive: true,
    });
  });

  it('canHardDelete=false quand inactif mais référencé', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findUnique.mockResolvedValue({ id: 'p-1', isActive: false });
    prisma.purchaseItem.count.mockResolvedValue(2);
    prisma.inventoryLine.count.mockResolvedValue(4);

    const service = makeService(prisma);
    const res = await service.countReferences('p-1');
    expect(res).toEqual({
      purchaseItemCount: 2,
      inventoryLineCount: 4,
      canHardDelete: false,
      isActive: false,
    });
  });

  it('canHardDelete=true seulement quand inactif ET aucune référence', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findUnique.mockResolvedValue({ id: 'p-1', isActive: false });
    prisma.purchaseItem.count.mockResolvedValue(0);
    prisma.inventoryLine.count.mockResolvedValue(0);

    const service = makeService(prisma);
    const res = await service.countReferences('p-1');
    expect(res.canHardDelete).toBe(true);
  });
});

// ---------------------------------------------------------------
// Suite : cross-branch copy — distinction active / inactive / absent
// ---------------------------------------------------------------

describe('ProductsService.create (cross-branch copy)', () => {
  const owner = { id: 'u-1', role: 'OWNER' as const, branchId: 'b-1', email: 'o@x' };

  it('cas absent → status "created"', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.create
      .mockResolvedValueOnce(productFixture()) // primary
      .mockResolvedValueOnce(productFixture({ branchId: 'b-2' })); // mirror
    prisma.branch.findMany.mockResolvedValue([{ id: 'b-2', name: 'Bishop' }]);
    prisma.inventoryProduct.findFirst.mockResolvedValue(null);

    const service = makeService(prisma);
    const result = await service.create(
      {
        branchId: 'b-1',
        name: 'Tomates',
        unit: 'kg',
        defaultCost: 5,
        copyToOtherBranch: true,
      },
      owner,
    );

    expect(result.copy).toMatchObject({ otherBranchName: 'Bishop', status: 'created' });
  });

  it('cas actif homonyme → status "alreadyExisted", aucune modification', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.create.mockResolvedValueOnce(productFixture());
    prisma.branch.findMany.mockResolvedValue([{ id: 'b-2', name: 'Bishop' }]);
    prisma.inventoryProduct.findFirst.mockResolvedValue({
      id: 'twin',
      name: 'Tomates',
      isActive: true,
    });

    const service = makeService(prisma);
    const result = await service.create(
      {
        branchId: 'b-1',
        name: 'Tomates',
        unit: 'kg',
        defaultCost: 5,
        copyToOtherBranch: true,
      },
      owner,
    );

    expect(result.copy).toMatchObject({ status: 'alreadyExisted' });
    // 1 seul create (le primary), aucun update sur le twin
    expect(prisma.inventoryProduct.create).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryProduct.update).not.toHaveBeenCalled();
  });

  it('cas inactif homonyme SANS action → status "inactive_match", rien réactivé', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.create.mockResolvedValueOnce(productFixture());
    prisma.branch.findMany.mockResolvedValue([{ id: 'b-2', name: 'Bishop' }]);
    prisma.inventoryProduct.findFirst.mockResolvedValue({
      id: 'twin',
      name: 'Tomates',
      isActive: false,
    });

    const service = makeService(prisma);
    const result = await service.create(
      {
        branchId: 'b-1',
        name: 'Tomates',
        unit: 'kg',
        defaultCost: 5,
        copyToOtherBranch: true,
        // Pas de reactivateInactiveTwin → décision explicite absente
      },
      owner,
    );

    expect(result.copy).toMatchObject({
      status: 'inactive_match',
      inactiveTwin: { productId: 'twin', productName: 'Tomates', targetBranchId: 'b-2' },
    });
    // Aucun update sur le twin — pas de réactivation silencieuse
    expect(prisma.inventoryProduct.update).not.toHaveBeenCalled();
  });

  it('cas inactif homonyme AVEC action explicite → status "reactivated"', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.create.mockResolvedValueOnce(productFixture());
    prisma.branch.findMany.mockResolvedValue([{ id: 'b-2', name: 'Bishop' }]);
    prisma.inventoryProduct.findFirst.mockResolvedValue({
      id: 'twin',
      name: 'Tomates',
      isActive: false,
    });
    prisma.inventoryProduct.update.mockResolvedValueOnce({ id: 'twin', isActive: true });

    const service = makeService(prisma);
    const result = await service.create(
      {
        branchId: 'b-1',
        name: 'Tomates',
        unit: 'kg',
        defaultCost: 5,
        copyToOtherBranch: true,
        reactivateInactiveTwin: true,
      },
      owner,
    );

    expect(result.copy).toMatchObject({ status: 'reactivated' });
    expect(prisma.inventoryProduct.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'twin' },
        data: expect.objectContaining({ isActive: true }),
      }),
    );
  });

  it('MANAGER ne peut pas déclencher copyToOtherBranch (403)', async () => {
    const prisma = buildPrismaMock();
    const service = makeService(prisma);
    const manager = { id: 'u-2', role: 'MANAGER' as const, branchId: 'b-1', email: 'm@x' };
    await expect(
      service.create(
        {
          branchId: 'b-1',
          name: 'X',
          unit: 'kg',
          defaultCost: 1,
          copyToOtherBranch: true,
        },
        manager,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
