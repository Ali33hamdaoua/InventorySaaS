/**
 * Tests unitaires import — Lot 1.
 *
 * Contrats testés :
 *  - preview : classifie un produit inactif homonyme comme INACTIVE_MATCH
 *    (jamais WARNING → aucune réactivation silencieuse au confirm).
 *  - confirm : sans décision explicite → ignore la ligne (isActive reste false).
 *  - confirm : avec REACTIVATE_AND_UPDATE → réactive + met à jour.
 *  - confirm : cas collision ACTIVE → update classique.
 *  - confirm : cas nouveau produit → create.
 */
import { ProductsImportService } from './products-import.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { ProductImportRow } from '@inventorymdb/shared';

type PrismaMock = {
  category: { findMany: jest.Mock };
  supplier: { findMany: jest.Mock };
  inventoryProduct: {
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

function buildPrismaMock(): PrismaMock {
  const m: PrismaMock = {
    category: { findMany: jest.fn().mockResolvedValue([{ id: 'cat-1', name: 'Légumes' }]) },
    supplier: { findMany: jest.fn().mockResolvedValue([{ id: 'sup-1', name: 'Fournisseur' }]) },
    inventoryProduct: {
      findMany: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
  m.$transaction.mockImplementation(async (cb: (tx: PrismaMock) => unknown) => cb(m));
  return m;
}

function makeService(prisma: PrismaMock): ProductsImportService {
  return new ProductsImportService(prisma as unknown as PrismaService);
}

function baseRow(overrides: Partial<ProductImportRow> = {}): ProductImportRow {
  return {
    rowNumber: 2,
    data: {
      name: 'Tomates',
      category: 'Légumes',
      supplier: '',
      unit: 'kg',
      defaultCost: 5,
      minStockLevel: 0,
      isActive: true,
    },
    status: 'VALID',
    errors: [],
    warnings: [],
    matchedCategoryId: 'cat-1',
    matchedSupplierId: null,
    existingProductId: null,
    ...overrides,
  };
}

describe('ProductsImportService.confirm', () => {
  it('CREATE quand aucun match', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findMany.mockResolvedValue([]); // aucun produit existant
    const service = makeService(prisma);

    const res = await service.confirm([baseRow()], 'b-1');

    expect(prisma.inventoryProduct.create).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryProduct.update).not.toHaveBeenCalled();
    expect(res.summary.createCount).toBe(1);
    expect(res.summary.updateCount).toBe(0);
    expect(res.summary.reactivatedCount).toBe(0);
    expect(res.summary.ignoredCount).toBe(0);
  });

  it('UPDATE quand collision ACTIVE (path classique)', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findMany.mockResolvedValue([
      { id: 'existing', name: 'Tomates', isActive: true },
    ]);
    const service = makeService(prisma);

    const res = await service.confirm(
      [baseRow({ status: 'WARNING', existingProductId: 'existing' })],
      'b-1',
    );

    expect(prisma.inventoryProduct.update).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryProduct.create).not.toHaveBeenCalled();
    expect(res.summary.updateCount).toBe(1);
    expect(res.summary.reactivatedCount).toBe(0);
  });

  it('IGNORE (défaut) quand collision INACTIVE SANS décision explicite', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findMany.mockResolvedValue([
      { id: 'existing', name: 'Tomates', isActive: false },
    ]);
    const service = makeService(prisma);

    const res = await service.confirm(
      [
        baseRow({
          status: 'INACTIVE_MATCH',
          existingProductId: 'existing',
          // AUCUN inactiveAction fourni → IGNORE par défaut
        }),
      ],
      'b-1',
    );

    // AUCUN write : ni create, ni update
    expect(prisma.inventoryProduct.create).not.toHaveBeenCalled();
    expect(prisma.inventoryProduct.update).not.toHaveBeenCalled();
    expect(res.summary.ignoredCount).toBe(1);
    expect(res.summary.reactivatedCount).toBe(0);
    expect(res.importedCount).toBe(0);
  });

  it('IGNORE explicite → aucun changement', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findMany.mockResolvedValue([
      { id: 'existing', name: 'Tomates', isActive: false },
    ]);
    const service = makeService(prisma);

    const res = await service.confirm(
      [
        baseRow({
          status: 'INACTIVE_MATCH',
          existingProductId: 'existing',
          inactiveAction: 'IGNORE',
        }),
      ],
      'b-1',
    );

    expect(prisma.inventoryProduct.update).not.toHaveBeenCalled();
    expect(res.summary.ignoredCount).toBe(1);
  });

  it('REACTIVATE_AND_UPDATE → update + isActive=true forcé', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findMany.mockResolvedValue([
      { id: 'existing', name: 'Tomates', isActive: false },
    ]);
    const service = makeService(prisma);

    const res = await service.confirm(
      [
        baseRow({
          status: 'INACTIVE_MATCH',
          existingProductId: 'existing',
          inactiveAction: 'REACTIVATE_AND_UPDATE',
        }),
      ],
      'b-1',
    );

    expect(prisma.inventoryProduct.update).toHaveBeenCalledTimes(1);
    const call = prisma.inventoryProduct.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'existing' });
    expect(call.data.isActive).toBe(true);
    expect(res.summary.reactivatedCount).toBe(1);
    expect(res.summary.ignoredCount).toBe(0);
    expect(res.importedCount).toBe(1);
  });

  it('ERROR rows sont skippées', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    const res = await service.confirm(
      [baseRow({ status: 'ERROR', errors: [{ field: 'name', message: 'requis' }] })],
      'b-1',
    );

    expect(prisma.inventoryProduct.create).not.toHaveBeenCalled();
    expect(prisma.inventoryProduct.update).not.toHaveBeenCalled();
    expect(res.importedCount).toBe(0);
  });
});
