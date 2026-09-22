/**
 * Tests unitaires — Frais supplémentaires (essence / livraison / péage…).
 *
 * Contrat métier V1 vérifié ici (Prisma mocké — pas de DB) :
 *   1  Purchase sans frais : comportement identique (aucun sync frais).
 *   2  Purchase avec Essence HT 40 : crée bien un PurchaseAdditionalCost.
 *   3  Le mirror AccountingExpense est créé (1 par frais).
 *   4  Le mirror porte `amountBeforeTax` = HT du frais.
 *   5  Le mirror porte `totalAmount` = HT (arrondi cents).
 *   6  Le mirror est `includeInFinancialReports: true`.
 *   7  Le mirror utilise `sourceType = PURCHASE_ADDITIONAL_COST` (donc
 *      inclus dans le rapport financier — filtre n'exclut que PURCHASE).
 *   8  Le mirror PRINCIPAL Purchase reste `sourceType=PURCHASE` +
 *      `includeInFinancialReports: false` — INCHANGÉ.
 *   9  `syncProductDefaultCostsFromPurchase` n'est PAS appelé par les frais
 *      (donc aucun impact sur Product.defaultCost / WAC).
 *  10  Modification (drop & recreate) : ancienne ligne supprimée avant
 *      insertion des nouvelles → cascade nettoie l'AccountingExpense
 *      correspondant.
 *  11  Suppression d'un frais (envoi d'un tableau vide en UPDATE) : delete
 *      appelé, aucun create.
 *  12  Catégorie comptable inexistante → 400 avant toute écriture.
 *  13  L'invariant totalAmount = HT est respecté (2 déc).
 */
import { BadRequestException } from '@nestjs/common';
import { AccountingSourceType, Prisma } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AccountingCategoriesService } from '../accounting-categories/accounting-categories.service';

// -------- Mocks --------

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
  };
  purchaseItem: { deleteMany: jest.Mock };
  purchaseAdditionalCost: { deleteMany: jest.Mock; create: jest.Mock };
  accountingExpense: { deleteMany: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

function buildPrismaMock(): PrismaMock {
  const m: PrismaMock = {
    inventoryProduct: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'p-1', name: 'Tomates', isActive: true },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
    supplier: {
      findUnique: jest.fn().mockResolvedValue({ id: 's-1', name: 'Fournisseur X' }),
    },
    inventoryPeriod: { findUnique: jest.fn().mockResolvedValue(null) },
    accountingCategory: {
      // Renvoie exactement les IDs demandés → passe le check d'existence.
      // Les tests qui veulent simuler une catégorie introuvable écrasent
      // ce mock avec un tableau vide.
      findMany: jest.fn((args: { where: { id: { in: string[] } } }) =>
        Promise.resolve(args.where.id.in.map((id) => ({ id }))),
      ),
    },
    purchase: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    purchaseItem: { deleteMany: jest.fn() },
    purchaseAdditionalCost: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
    },
    accountingExpense: {
      deleteMany: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
  m.$transaction.mockImplementation(async (cb: (tx: PrismaMock) => unknown) => cb(m));
  return m;
}

const accountingCategoriesStub = {
  findOrCreate: jest.fn().mockResolvedValue({ id: 'ac-purchase' }),
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

function createdPurchaseFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pu-1',
    branchId: 'b-1',
    supplierId: 's-1',
    purchaseDate: new Date('2026-08-01'),
    subtotalHT: new Prisma.Decimal(200),
    totalAmount: new Prisma.Decimal(200),
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    supplier: { id: 's-1', name: 'Fournisseur X', contactName: null },
    items: [
      {
        id: 'it-1',
        productId: 'p-1',
        quantity: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(200),
        totalPrice: new Prisma.Decimal(200),
        product: { id: 'p-1', name: 'Tomates', unit: 'kg', isActive: true },
      },
    ],
    additionalCosts: [],
    ...overrides,
  };
}

const baseCreateDto = {
  branchId: 'b-1',
  supplierId: 's-1',
  purchaseDate: new Date('2026-08-01'),
  items: [{ productId: 'p-1', quantity: 1, unitPrice: 200 }],
};

// ----------------- Tests -----------------

describe('PurchasesService — Frais supplémentaires (V1)', () => {
  describe('CREATE', () => {
    it('1. Purchase sans frais → aucun sync des frais (comportement identique)', async () => {
      const prisma = buildPrismaMock();
      prisma.purchase.create.mockResolvedValue(createdPurchaseFixture());
      prisma.purchase.findUnique.mockResolvedValue(createdPurchaseFixture());
      const service = makeService(prisma);

      await service.create(baseCreateDto, admin);

      // Aucun frais → aucun appel drop/create sur purchaseAdditionalCost
      expect(prisma.purchaseAdditionalCost.deleteMany).not.toHaveBeenCalled();
      expect(prisma.purchaseAdditionalCost.create).not.toHaveBeenCalled();
      // Le mirror Purchase principal reste appelé une fois (comportement existant)
      expect(prisma.accountingExpense.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.accountingExpense.create).toHaveBeenCalledTimes(1);
    });

    it('2, 3, 4, 5, 6, 7. Un frais Essence de 40 crée les 2 rows attendues', async () => {
      const prisma = buildPrismaMock();
      prisma.purchase.create.mockResolvedValue(createdPurchaseFixture());
      prisma.purchase.findUnique.mockResolvedValue(createdPurchaseFixture());
      prisma.purchaseAdditionalCost.create.mockResolvedValue({ id: 'pac-42' });
      const service = makeService(prisma);

      await service.create(
        {
          ...baseCreateDto,
          additionalCosts: [
            {
              costType: 'ESSENCE',
              accountingCategoryId: 'ac-fuel',
              amountBeforeTax: 40,
            },
          ],
        },
        admin,
      );

      // 2. PurchaseAdditionalCost créé avec les bons champs
      expect(prisma.purchaseAdditionalCost.create).toHaveBeenCalledTimes(1);
      const pacCall = prisma.purchaseAdditionalCost.create.mock.calls[0][0];
      expect(pacCall.data.costType).toBe('ESSENCE');
      expect(pacCall.data.accountingCategoryId).toBe('ac-fuel');
      expect(pacCall.data.amountBeforeTax).toEqual(new Prisma.Decimal(40));
      // 5. total = HT (arrondi cents)
      expect(pacCall.data.totalAmount).toEqual(new Prisma.Decimal(40));

      // 3. Un mirror AccountingExpense en plus (2 appels au total = mirror
      //    principal PURCHASE + mirror du frais).
      expect(prisma.accountingExpense.create).toHaveBeenCalledTimes(2);
      const mirrors = prisma.accountingExpense.create.mock.calls.map(
        (c) => (c[0] as { data: Record<string, unknown> }).data,
      );
      const feeMirror = mirrors.find(
        (m) => m.sourceType === AccountingSourceType.PURCHASE_ADDITIONAL_COST,
      );
      expect(feeMirror).toBeDefined();

      // 4. Le mirror porte le HT
      expect((feeMirror!.amountBeforeTax as Prisma.Decimal).toString()).toBe('40');
      // 5. Le mirror porte le total
      expect((feeMirror!.totalAmount as Prisma.Decimal).toString()).toBe('40');
      // 6. Inclus dans le rapport financier
      expect(feeMirror!.includeInFinancialReports).toBe(true);
      // 7. sourceType distinct de PURCHASE → INCLUS par le filtre
      // `sourceType != PURCHASE` du financial-reports service (LOT 2 HT).
      expect(feeMirror!.sourceType).toBe(AccountingSourceType.PURCHASE_ADDITIONAL_COST);
      // Lié via purchaseAdditionalCostId (pas purchaseId — sinon conflit
      // avec le mirror principal @unique).
      expect(feeMirror!.purchaseAdditionalCostId).toBe('pac-42');
      expect(feeMirror!.purchaseId).toBeUndefined();
    });

    it('8. Le mirror PRINCIPAL Purchase reste PURCHASE + includeInFinancialReports=false', async () => {
      const prisma = buildPrismaMock();
      prisma.purchase.create.mockResolvedValue(createdPurchaseFixture());
      prisma.purchase.findUnique.mockResolvedValue(createdPurchaseFixture());
      prisma.purchaseAdditionalCost.create.mockResolvedValue({ id: 'pac-1' });
      const service = makeService(prisma);

      await service.create(
        {
          ...baseCreateDto,
          additionalCosts: [
            {
              costType: 'ESSENCE',
              accountingCategoryId: 'ac-fuel',
              amountBeforeTax: 40,
            },
          ],
        },
        admin,
      );

      const mirrors = prisma.accountingExpense.create.mock.calls.map(
        (c) => (c[0] as { data: Record<string, unknown> }).data,
      );
      const purchaseMirror = mirrors.find(
        (m) => m.sourceType === AccountingSourceType.PURCHASE,
      );
      expect(purchaseMirror).toBeDefined();
      // Règle anti-double-comptage : ne DOIT pas être inclus dans le rapport.
      expect(purchaseMirror!.includeInFinancialReports).toBe(false);
      // Porte le HT/total de la Purchase (produits seuls).
      expect((purchaseMirror!.amountBeforeTax as Prisma.Decimal).toString()).toBe('200');
    });

    it('9. Aucun impact sur Product.defaultCost via les frais (WAC intact)', async () => {
      const prisma = buildPrismaMock();
      prisma.purchase.create.mockResolvedValue(createdPurchaseFixture());
      prisma.purchase.findUnique.mockResolvedValue(createdPurchaseFixture());
      prisma.purchaseAdditionalCost.create.mockResolvedValue({ id: 'pac-1' });
      const service = makeService(prisma);

      await service.create(
        {
          ...baseCreateDto,
          additionalCosts: [
            {
              costType: 'LIVRAISON',
              accountingCategoryId: 'ac-deliv',
              amountBeforeTax: 30,
            },
          ],
        },
        admin,
      );

      // 1 update = sync defaultCost du produit Tomates (path existant).
      // Aucun update supplémentaire dû aux frais.
      expect(prisma.inventoryProduct.update).toHaveBeenCalledTimes(1);
      const productUpdate = prisma.inventoryProduct.update.mock.calls[0][0];
      // Le prix mis à jour reste 200 (unitPrice du produit) — les frais
      // n'entrent PAS dans le calcul.
      expect(productUpdate.data.defaultCost).toEqual(new Prisma.Decimal(200));
    });

    it('12. Catégorie comptable inexistante → 400 avant écriture', async () => {
      const prisma = buildPrismaMock();
      prisma.accountingCategory.findMany.mockResolvedValue([]); // aucune catégorie ne matche
      const service = makeService(prisma);

      await expect(
        service.create(
          {
            ...baseCreateDto,
            additionalCosts: [
              {
                costType: 'ESSENCE',
                accountingCategoryId: 'ac-inexistant',
                amountBeforeTax: 40,
              },
            ],
          },
          admin,
        ),
      ).rejects.toThrow(BadRequestException);

      // Aucun écrit sur DB
      expect(prisma.purchase.create).not.toHaveBeenCalled();
      expect(prisma.purchaseAdditionalCost.create).not.toHaveBeenCalled();
    });

    it('13. Invariant totalAmount = HT préservé (arrondi 2 déc)', async () => {
      const prisma = buildPrismaMock();
      prisma.purchase.create.mockResolvedValue(createdPurchaseFixture());
      prisma.purchase.findUnique.mockResolvedValue(createdPurchaseFixture());
      prisma.purchaseAdditionalCost.create.mockResolvedValue({ id: 'pac-1' });
      const service = makeService(prisma);

      await service.create(
        {
          ...baseCreateDto,
          additionalCosts: [
            {
              costType: 'PEAGE',
              accountingCategoryId: 'ac-fuel',
              amountBeforeTax: 3.33,
            },
          ],
        },
        admin,
      );

      const call = prisma.purchaseAdditionalCost.create.mock.calls[0][0];
      expect((call.data.totalAmount as Prisma.Decimal).toString()).toBe('3.33');
    });
  });

  describe('UPDATE — drop & recreate', () => {
    // Fixture d'un achat existant sans items dto (header-only path)
    const existingRaw = createdPurchaseFixture({
      items: [
        {
          id: 'it-1',
          productId: 'p-1',
          quantity: new Prisma.Decimal(1),
          unitPrice: new Prisma.Decimal(200),
          totalPrice: new Prisma.Decimal(200),
          product: { id: 'p-1', name: 'Tomates', unit: 'kg', isActive: true },
        },
      ],
    });

    it('10. Modification d\'un frais → deleteMany + create (mirror refait via cascade)', async () => {
      const prisma = buildPrismaMock();
      prisma.purchase.findUnique.mockResolvedValue(existingRaw);
      prisma.purchase.update.mockResolvedValue(existingRaw);
      prisma.purchaseAdditionalCost.create.mockResolvedValue({ id: 'pac-new' });
      const service = makeService(prisma);

      await service.update(
        'pu-1',
        {
          additionalCosts: [
            {
              costType: 'ESSENCE',
              accountingCategoryId: 'ac-fuel',
              amountBeforeTax: 50, // nouvelle valeur
            },
          ],
        },
        admin,
      );

      // Drop des anciens frais (cascade FK nettoie les mirrors)
      expect(prisma.purchaseAdditionalCost.deleteMany).toHaveBeenCalledWith({
        where: { purchaseId: 'pu-1' },
      });
      // Nouveau frais créé + son mirror
      expect(prisma.purchaseAdditionalCost.create).toHaveBeenCalledTimes(1);
      const feeMirror = prisma.accountingExpense.create.mock.calls
        .map((c) => (c[0] as { data: Record<string, unknown> }).data)
        .find((m) => m.sourceType === AccountingSourceType.PURCHASE_ADDITIONAL_COST);
      expect((feeMirror!.amountBeforeTax as Prisma.Decimal).toString()).toBe('50');
    });

    it('11. Envoyer un tableau vide → deleteMany appelé, aucun create', async () => {
      const prisma = buildPrismaMock();
      prisma.purchase.findUnique.mockResolvedValue(existingRaw);
      prisma.purchase.update.mockResolvedValue(existingRaw);
      const service = makeService(prisma);

      await service.update('pu-1', { additionalCosts: [] }, admin);

      expect(prisma.purchaseAdditionalCost.deleteMany).toHaveBeenCalledWith({
        where: { purchaseId: 'pu-1' },
      });
      expect(prisma.purchaseAdditionalCost.create).not.toHaveBeenCalled();
    });

    it('additionalCosts absent (undefined) → ne touche pas aux frais existants', async () => {
      const prisma = buildPrismaMock();
      prisma.purchase.findUnique.mockResolvedValue(existingRaw);
      prisma.purchase.update.mockResolvedValue(existingRaw);
      const service = makeService(prisma);

      // Update d'une note uniquement — pas de `additionalCosts` dans le DTO
      await service.update('pu-1', { note: 'nouvelle note' }, admin);

      expect(prisma.purchaseAdditionalCost.deleteMany).not.toHaveBeenCalled();
      expect(prisma.purchaseAdditionalCost.create).not.toHaveBeenCalled();
    });
  });
});
