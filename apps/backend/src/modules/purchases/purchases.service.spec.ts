/**
 * Tests unitaires — garde-fou "inactif refusé sur nouvel achat" — Lot 1.
 *
 * Contrat testé :
 *  - `create` refuse un achat qui référence un produit inactif (400).
 *  - `create` réussit si tous les produits sont actifs.
 *  - `update` accepte les productIds DÉJÀ présents sur l'achat (contexte
 *    historique) même s'ils sont désactivés depuis.
 *  - `update` refuse les NOUVEAUX productIds ajoutés qui sont inactifs.
 *
 * Toutes les side-effects lourdes (accounting sync, WAC, defaultCost sync,
 * period check) sont stubbées ou contournées via findOneRaw pour rester
 * ciblé sur la nouvelle règle.
 */
import { BadRequestException } from '@nestjs/common';
import { PeriodStatus, Prisma } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AccountingCategoriesService } from '../accounting-categories/accounting-categories.service';

type PrismaMock = {
  inventoryProduct: { findMany: jest.Mock; update: jest.Mock };
  supplier: { findUnique: jest.Mock };
  inventoryPeriod: { findUnique: jest.Mock };
  accountingCategory: { findMany: jest.Mock };
  purchase: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findMany: jest.Mock;
    aggregate: jest.Mock;
    groupBy: jest.Mock;
    count: jest.Mock;
  };
  purchaseItem: { deleteMany: jest.Mock };
  purchaseAdditionalCost: { deleteMany: jest.Mock; create: jest.Mock };
  accountingExpense: { deleteMany: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

function buildPrismaMock(): PrismaMock {
  const m: PrismaMock = {
    inventoryProduct: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    supplier: { findUnique: jest.fn().mockResolvedValue({ id: 's-1', name: 'Sup' }) },
    inventoryPeriod: { findUnique: jest.fn().mockResolvedValue(null) },
    accountingCategory: { findMany: jest.fn().mockResolvedValue([]) },
    purchase: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    purchaseItem: { deleteMany: jest.fn() },
    purchaseAdditionalCost: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'pac-1' }),
    },
    accountingExpense: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  m.$transaction.mockImplementation(async (cb: (tx: PrismaMock) => unknown) => cb(m));
  return m;
}

const accountingCategoriesStub = {
  findOrCreate: jest.fn().mockResolvedValue({ id: 'ac-1' }),
} as unknown as AccountingCategoriesService;

function makeService(prisma: PrismaMock): PurchasesService {
  return new PurchasesService(
    prisma as unknown as PrismaService,
    accountingCategoriesStub,
  );
}

const admin = {
  id: 'u-a',
  role: 'ADMIN' as const,
  branchId: null,
  email: 'a@x',
};

describe('PurchasesService.create — garde-fou produit inactif', () => {
  const baseDto = {
    branchId: 'b-1',
    supplierId: 's-1',
    purchaseDate: new Date('2026-08-01'),
    tpsAmount: 0,
    tvqAmount: 0,
    items: [{ productId: 'p-active', quantity: 1, unitPrice: 10 }],
  };

  it('refuse (400) si un produit est inactif', async () => {
    const prisma = buildPrismaMock();
    // Deux produits demandés, l'un inactif
    prisma.inventoryProduct.findMany.mockResolvedValue([
      { id: 'p-active', name: 'Actif', isActive: true },
      { id: 'p-inactive', name: 'Inactif', isActive: false },
    ]);
    const service = makeService(prisma);

    await expect(
      service.create(
        {
          ...baseDto,
          items: [
            { productId: 'p-active', quantity: 1, unitPrice: 10 },
            { productId: 'p-inactive', quantity: 1, unitPrice: 5 },
          ],
        },
        admin,
      ),
    ).rejects.toThrow(BadRequestException);
    // Le service n'a jamais atteint le create
    expect(prisma.purchase.create).not.toHaveBeenCalled();
  });

  it('réussit si tous les produits sont actifs', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryProduct.findMany.mockResolvedValue([
      { id: 'p-active', name: 'Actif', isActive: true },
    ]);
    const createdRow = {
      id: 'pu-1',
      branchId: 'b-1',
      supplierId: 's-1',
      purchaseDate: new Date('2026-08-01'),
      subtotalHT: new Prisma.Decimal(10),
      tpsAmount: new Prisma.Decimal(0),
      tvqAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(10),
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      supplier: { id: 's-1', name: 'Sup', contactName: null },
      items: [],
      additionalCosts: [],
    };
    prisma.purchase.create.mockResolvedValue(createdRow);
    // findUnique appelé 2 fois : (a) syncAccountingExpensesForPurchase avec un
    // subset restreint (b) re-read final avec PURCHASE_INCLUDE complet.
    prisma.purchase.findUnique
      .mockResolvedValueOnce({
        id: 'pu-1',
        branchId: 'b-1',
        supplier: { id: 's-1', name: 'Sup' },
        supplierId: 's-1',
        purchaseDate: new Date('2026-08-01'),
        subtotalHT: new Prisma.Decimal(10),
        tpsAmount: new Prisma.Decimal(0),
        tvqAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(10),
        note: null,
        items: [{ id: 'it-1' }],
      })
      .mockResolvedValueOnce(createdRow);
    // sync product defaults n'a pas d'incidence si items ok
    const service = makeService(prisma);

    const res = await service.create(baseDto, admin);
    expect(res).toBeDefined();
    expect(prisma.purchase.create).toHaveBeenCalled();
  });
});

describe('PurchasesService.update — inactif accepté pour un product déjà présent', () => {
  const existingPurchase = {
    id: 'pu-old',
    branchId: 'b-1',
    supplierId: 's-1',
    purchaseDate: new Date('2026-07-01'),
    subtotalHT: new Prisma.Decimal(10),
    tpsAmount: new Prisma.Decimal(0),
    tvqAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(10),
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    supplier: { id: 's-1', name: 'Sup', contactName: null },
    items: [
      {
        id: 'it-1',
        purchaseId: 'pu-old',
        productId: 'p-legacy',
        quantity: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(10),
        totalPrice: new Prisma.Decimal(10),
        product: { id: 'p-legacy', name: 'Legacy', unit: 'kg', isActive: false },
      },
    ],
    // Additional costs empty pour éviter que serializePurchase pète sur .map()
    additionalCosts: [],
  };

  it('accepte un update qui garde le même productId inactif (historique)', async () => {
    const prisma = buildPrismaMock();
    prisma.purchase.findUnique.mockResolvedValue(existingPurchase);
    // Simule que le produit existe bien dans la branche (isActive ne compte
    // pas ici car pas requireActive sur cet id existant).
    prisma.inventoryProduct.findMany.mockResolvedValue([
      { id: 'p-legacy', name: 'Legacy', isActive: false },
    ]);
    prisma.purchase.update.mockResolvedValue(existingPurchase);

    const service = makeService(prisma);
    // Update qui renvoie exactement le même produit inactif
    await expect(
      service.update(
        'pu-old',
        {
          items: [{ productId: 'p-legacy', quantity: 2, unitPrice: 10 }],
          tpsAmount: 0,
          tvqAmount: 0,
        },
        admin,
      ),
    ).resolves.toBeDefined();
  });

  it("refuse d'AJOUTER un nouvel item inactif à un achat existant", async () => {
    const prisma = buildPrismaMock();
    prisma.purchase.findUnique.mockResolvedValue(existingPurchase);
    // Premier appel de assertProductsBelongToBranch (submittedIds)
    // Deuxième appel : requireActive sur les newlyAddedIds
    prisma.inventoryProduct.findMany
      .mockResolvedValueOnce([
        { id: 'p-legacy', name: 'Legacy', isActive: false },
        { id: 'p-new-inactive', name: 'NewInactive', isActive: false },
      ])
      .mockResolvedValueOnce([
        { id: 'p-new-inactive', name: 'NewInactive', isActive: false },
      ]);

    const service = makeService(prisma);
    await expect(
      service.update(
        'pu-old',
        {
          items: [
            { productId: 'p-legacy', quantity: 1, unitPrice: 10 },
            { productId: 'p-new-inactive', quantity: 1, unitPrice: 5 },
          ],
          tpsAmount: 0,
          tvqAmount: 0,
        },
        admin,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PurchasesService — Feature A: Total Facture (invoiceGrandTotal)', () => {
  it('calcule correctement invoiceGrandTotal = totalAmount + additionalCostsTotalTTC sans altérer totalAmount', async () => {
    const prisma = buildPrismaMock();
    const mockPurchaseWithCosts = {
      id: 'pu-costs-1',
      branchId: 'b-1',
      supplierId: 's-1',
      purchaseDate: new Date('2026-08-15'),
      subtotalHT: new Prisma.Decimal(100.0),
      tpsAmount: new Prisma.Decimal(5.0),
      tvqAmount: new Prisma.Decimal(9.98),
      totalAmount: new Prisma.Decimal(114.98), // Products TTC
      note: 'Facture avec frais',
      createdAt: new Date(),
      updatedAt: new Date(),
      supplier: { id: 's-1', name: 'Fournisseur Test', contactName: null },
      items: [
        {
          id: 'it-1',
          purchaseId: 'pu-costs-1',
          productId: 'prod-1',
          quantity: new Prisma.Decimal(10),
          unitPrice: new Prisma.Decimal(10.0),
          totalPrice: new Prisma.Decimal(100.0),
          product: { id: 'prod-1', name: 'Produit A', unit: 'kg', isActive: true },
        },
      ],
      additionalCosts: [
        {
          id: 'ac-1',
          purchaseId: 'pu-costs-1',
          costType: 'ESSENCE',
          description: 'Carburant',
          accountingCategoryId: 'ac-cat-1',
          amountBeforeTax: new Prisma.Decimal(20.0),
          tpsAmount: new Prisma.Decimal(1.0),
          tvqAmount: new Prisma.Decimal(2.0),
          totalAmount: new Prisma.Decimal(23.0),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'ac-2',
          purchaseId: 'pu-costs-1',
          costType: 'LIVRAISON',
          description: 'Frais de port',
          accountingCategoryId: 'ac-cat-2',
          amountBeforeTax: new Prisma.Decimal(10.0),
          tpsAmount: new Prisma.Decimal(0.5),
          tvqAmount: new Prisma.Decimal(1.0),
          totalAmount: new Prisma.Decimal(11.5),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };

    prisma.purchase.findUnique.mockResolvedValue(mockPurchaseWithCosts);
    const service = makeService(prisma);

    const result = await service.findOne('pu-costs-1');

    // 1. Sanctuarisation de totalAmount (produits TTC uniquement)
    expect(result.totalAmount).toBe('114.98');
    expect(result.subtotalHT).toBe('100');

    // 2. Calculs DTO des frais supplémentaires
    // HT: 20 + 10 = 30.00
    expect(result.additionalCostsTotalHT).toBe('30.00');
    // TTC: 23 + 11.5 = 34.50
    expect(result.additionalCostsTotalTTC).toBe('34.50');

    // 3. Grand total facture: 114.98 + 34.50 = 149.48
    expect(result.invoiceGrandTotal).toBe('149.48');
  });

  it('retourne les totaux égaux lorsque la facture n\'a aucun frais supplémentaire', async () => {
    const prisma = buildPrismaMock();
    const mockPurchaseNoCosts = {
      id: 'pu-nocosts',
      branchId: 'b-1',
      supplierId: 's-1',
      purchaseDate: new Date('2026-08-15'),
      subtotalHT: new Prisma.Decimal(50.0),
      tpsAmount: new Prisma.Decimal(2.5),
      tvqAmount: new Prisma.Decimal(4.99),
      totalAmount: new Prisma.Decimal(57.49),
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      supplier: { id: 's-1', name: 'Sup', contactName: null },
      items: [],
      additionalCosts: [],
    };

    prisma.purchase.findUnique.mockResolvedValue(mockPurchaseNoCosts);
    const service = makeService(prisma);

    const result = await service.findOne('pu-nocosts');

    expect(result.totalAmount).toBe('57.49');
    expect(result.additionalCostsTotalHT).toBe('0.00');
    expect(result.additionalCostsTotalTTC).toBe('0.00');
    expect(result.invoiceGrandTotal).toBe('57.49');
  });
});

