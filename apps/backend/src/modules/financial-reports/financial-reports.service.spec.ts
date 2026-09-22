/**
 * Tests unitaires — LOT 2 : le rapport financier agrège HT et non TTC.
 *
 * Ces tests exercent `computeLive` (agrégation live) et les serializers
 * `serializeLive` / `serializeLocked`. Prisma est mocké — aucune DB.
 *
 * Contrats testés :
 *  1  Une dépense HT 100 / TTC 114.98 contribue 100.
 *  2  Deux dépenses même catégorie : 100 + 50 = 150 (pas 172.47).
 *  3  Une dépense includeInFinancialReports=false ne compte pas.
 *  4  Une dépense deletedAt non null ne compte pas.
 *  5  Une dépense sourceType=PURCHASE ne compte pas (défense en profondeur).
 *  6  Une dépense sans accountingCategoryId ne compte pas.
 *  7  Un mirror REPAIR contribue amountBeforeTax (même HT que MANUAL).
 *  8  totalExpenses = realCost + Σ HT catégories + laborCost.
 *  9  DRAFT → serializeLive utilise HT live.
 *  10 LOCKED → serializeLocked lit snapshot, jamais recalcul.
 *  11 unlock → futur getOrCreate serializeLive redonne HT live.
 *  12 amountBeforeTax=0 & totalAmount>0 : contribue 0. Aucun fallback TTC.
 *  13 Purchase mirror n'entre pas dans le rapport (double-vérification via
 *     filtre WHERE — c'est Prisma qui exclut).
 *  14 Arrondi cohérent — les strings du DTO sont bien formatables.
 */
import { Prisma, FinancialReportStatus } from '@prisma/client';
import { FinancialReportsService } from './financial-reports.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

// ---------------------------------------------------------------
// Mock Prisma minimal — juste les tables lues par le service.
// ---------------------------------------------------------------

type PrismaMock = {
  financialReport: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  inventoryPeriod: { findUnique: jest.Mock };
  accountingExpense: { groupBy: jest.Mock };
  laborEntry: { aggregate: jest.Mock };
  accountingCategory: { findMany: jest.Mock };
  user: { findUnique: jest.Mock };
};

function buildPrismaMock(): PrismaMock {
  return {
    financialReport: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    inventoryPeriod: { findUnique: jest.fn() },
    accountingExpense: { groupBy: jest.fn() },
    laborEntry: { aggregate: jest.fn() },
    accountingCategory: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  };
}

function makeService(prisma: PrismaMock): FinancialReportsService {
  return new FinancialReportsService(prisma as unknown as PrismaService);
}

// Report shape passé à `computeLive` (juste les champs qu'il lit).
function draftReport(
  overrides: Partial<{
    id: string;
    branchId: string;
    month: number;
    year: number;
    sales: Prisma.Decimal;
    discounts: Prisma.Decimal;
    employeeMeals: Prisma.Decimal;
    tips: Prisma.Decimal;
    otherRevenue: Prisma.Decimal;
    laborCost: Prisma.Decimal;
  }> = {},
) {
  return {
    id: 'r-1',
    branchId: 'b-1',
    month: 8,
    year: 2026,
    sales: new Prisma.Decimal(0),
    discounts: new Prisma.Decimal(0),
    employeeMeals: new Prisma.Decimal(0),
    tips: new Prisma.Decimal(0),
    otherRevenue: new Prisma.Decimal(0),
    laborCost: new Prisma.Decimal(0),
    ...overrides,
  };
}

// Accès direct à `computeLive` (méthode privée) pour tester la formule
// sans passer par toute la chaîne getOrCreate + Prisma. Le cast `any`
// est volontaire et cantonné aux tests.
type ComputeLiveResult = {
  foodCost: Prisma.Decimal;
  paperCost: Prisma.Decimal;
  cleaningCost: Prisma.Decimal;
  realCost: Prisma.Decimal;
  laborCost: Prisma.Decimal;
  expensesByCategory: Record<string, number>;
  categoryTotal: Prisma.Decimal;
  totalExpenses: Prisma.Decimal;
  grossRevenue: Prisma.Decimal;
  netRevenue: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
  netProfit: Prisma.Decimal;
};

function callComputeLive(
  service: FinancialReportsService,
  input: ReturnType<typeof draftReport>,
): Promise<ComputeLiveResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (service as any).computeLive(input);
}

// --- helpers pour construire des groupBy rows -----------------------
function grpRow(categoryId: string, amountBeforeTax: number) {
  return {
    accountingCategoryId: categoryId,
    _sum: { amountBeforeTax: new Prisma.Decimal(amountBeforeTax) },
  };
}

// Simule la présence d'un InventoryReport lié à la période.
function fixturePeriodWithReport(
  overrides: Partial<{
    id: string;
    month: number;
    year: number;
    status: 'OPEN' | 'CLOSED';
    foodCost: number;
    paperCost: number;
    cleaningCost: number;
    realCost: number;
  }> = {},
) {
  return {
    id: 'p-1',
    branchId: 'b-1',
    month: overrides.month ?? 8,
    year: overrides.year ?? 2026,
    status: overrides.status ?? 'OPEN',
    report: {
      foodCost: new Prisma.Decimal(overrides.foodCost ?? 0),
      paperCost: new Prisma.Decimal(overrides.paperCost ?? 0),
      cleaningCost: new Prisma.Decimal(overrides.cleaningCost ?? 0),
      realCost: new Prisma.Decimal(overrides.realCost ?? 0),
    },
  };
}

// ---------------------------------------------------------------

describe('FinancialReportsService.computeLive — LOT 2 (HT)', () => {
  it('1. Une dépense HT 100 / TTC 114.98 contribue 100', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    prisma.accountingExpense.groupBy.mockResolvedValue([grpRow('cat-essence', 100)]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([{ id: 'cat-essence', name: 'Essence' }]);

    const service = makeService(prisma);
    const res = await callComputeLive(service, draftReport());

    expect(res.expensesByCategory).toEqual({ Essence: 100 });
    expect(res.categoryTotal.toNumber()).toBe(100);
    // Vérif défense en profondeur : PAS 114.98
    expect(res.expensesByCategory.Essence).not.toBe(114.98);
  });

  it('2. Deux dépenses même catégorie : 100 + 50 = 150 (jamais 172.47 en TTC)', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    // Simule l'agrégat Prisma qui aurait déjà sommé les 2 lignes sur cat-1
    prisma.accountingExpense.groupBy.mockResolvedValue([grpRow('cat-1', 150)]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Fournitures' }]);

    const service = makeService(prisma);
    const res = await callComputeLive(service, draftReport());
    expect(res.expensesByCategory.Fournitures).toBe(150);
    expect(res.expensesByCategory.Fournitures).not.toBe(172.47);
  });

  it('3. includeInFinancialReports=false : garanti par le filtre WHERE Prisma', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    prisma.accountingExpense.groupBy.mockResolvedValue([]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([]);

    const service = makeService(prisma);
    await callComputeLive(service, draftReport());

    // Vérifie que le filtre est bien passé au groupBy
    expect(prisma.accountingExpense.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ includeInFinancialReports: true }),
      }),
    );
  });

  it('4. deletedAt: null est dans le filtre WHERE', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    prisma.accountingExpense.groupBy.mockResolvedValue([]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([]);

    const service = makeService(prisma);
    await callComputeLive(service, draftReport());

    expect(prisma.accountingExpense.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  it('5. sourceType != PURCHASE dans le filtre WHERE (défense anti-double-count)', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    prisma.accountingExpense.groupBy.mockResolvedValue([]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([]);

    const service = makeService(prisma);
    await callComputeLive(service, draftReport());

    const call = prisma.accountingExpense.groupBy.mock.calls[0][0];
    expect(call.where.sourceType).toEqual({ not: 'PURCHASE' });
  });

  it('6. accountingCategoryId: not null dans le filtre WHERE', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    // Row avec categoryId null → doit être écartée par le loop même si le
    // filtre WHERE l'a laissée passer par accident (defense in depth).
    prisma.accountingExpense.groupBy.mockResolvedValue([
      { accountingCategoryId: null, _sum: { amountBeforeTax: new Prisma.Decimal(999) } },
    ]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([]);

    const service = makeService(prisma);
    const res = await callComputeLive(service, draftReport());

    // La ligne sans categoryId est ignorée → 0 dans le total
    expect(res.categoryTotal.toNumber()).toBe(0);
    expect(res.expensesByCategory).toEqual({});
    // Vérif du filtre WHERE
    const call = prisma.accountingExpense.groupBy.mock.calls[0][0];
    expect(call.where.accountingCategoryId).toEqual({ not: null });
  });

  it('7. Repair mirror : contribue amountBeforeTax, pas totalAmount', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    // Simule Prisma qui a groupé une seule ligne REPAIR (HT 200)
    prisma.accountingExpense.groupBy.mockResolvedValue([grpRow('cat-maint', 200)]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([{ id: 'cat-maint', name: 'Maintenance' }]);

    const service = makeService(prisma);
    const res = await callComputeLive(service, draftReport());

    expect(res.expensesByCategory.Maintenance).toBe(200);
    // Aucune logique spéciale REPAIR — même code path que MANUAL
    expect(res.expensesByCategory.Maintenance).not.toBe(229.95); // TTC hypothétique
  });

  it('8. totalExpenses = realCost + Σ HT catégories + laborCost', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(
      fixturePeriodWithReport({
        realCost: 500,
        foodCost: 300,
        paperCost: 100,
        cleaningCost: 100,
      }),
    );
    prisma.accountingExpense.groupBy.mockResolvedValue([
      grpRow('cat-1', 100),
      grpRow('cat-2', 50),
    ]);
    prisma.laborEntry.aggregate.mockResolvedValue({
      _sum: { totalAmount: new Prisma.Decimal(1000) },
    });
    prisma.accountingCategory.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'A' },
      { id: 'cat-2', name: 'B' },
    ]);

    const service = makeService(prisma);
    const res = await callComputeLive(service, draftReport());

    // 500 (realCost) + 150 (catégories HT) + 1000 (labor)
    expect(res.totalExpenses.toNumber()).toBe(1650);
    expect(res.laborCost.toNumber()).toBe(1000);
    expect(res.categoryTotal.toNumber()).toBe(150);
  });

  it('9. DRAFT → serializeLive appelle computeLive et retourne HT', async () => {
    const prisma = buildPrismaMock();
    // getOrCreate flow : findUnique → si existant + DRAFT → serializeLive
    prisma.financialReport.findUnique.mockResolvedValue({
      id: 'r-1',
      branchId: 'b-1',
      month: 8,
      year: 2026,
      status: FinancialReportStatus.DRAFT,
      sales: new Prisma.Decimal(0),
      discounts: new Prisma.Decimal(0),
      employeeMeals: new Prisma.Decimal(0),
      tips: new Prisma.Decimal(0),
      otherRevenue: new Prisma.Decimal(0),
      laborCost: new Prisma.Decimal(0),
      notes: null,
      snapshotFoodCost: null,
      snapshotPaperCost: null,
      snapshotCleaningCost: null,
      snapshotExpensesByCategory: null,
      snapshotTotalExpenses: null,
      snapshotGrossRevenue: null,
      snapshotNetRevenue: null,
      snapshotNetProfit: null,
      snapshotFoodCostPct: null,
      snapshotNetMarginPct: null,
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: new Date('2026-08-01T00:00:00Z'),
    });
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    prisma.accountingExpense.groupBy.mockResolvedValue([grpRow('cat-1', 100)]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Essence' }]);

    const service = makeService(prisma);
    const user = {
      id: 'u-1',
      email: 'admin@x',
      role: 'ADMIN' as const,
      branchId: 'b-1',
    };
    const dto = await service.getOrCreate('b-1', 8, 2026, user);

    expect(dto.status).toBe('DRAFT');
    expect(dto.expensesByCategory).toEqual({ Essence: 100 });
    expect(dto.lockedAt).toBeNull();
  });

  it('10. LOCKED → serializeLocked lit snapshot, JAMAIS recalcul', async () => {
    const prisma = buildPrismaMock();
    // Snapshot enregistré à l'époque en TTC (172.47) — DOIT rester tel quel
    // même si la nouvelle formule HT donnerait 150.
    prisma.financialReport.findUnique.mockResolvedValue({
      id: 'r-1',
      branchId: 'b-1',
      month: 7,
      year: 2026,
      status: FinancialReportStatus.LOCKED,
      sales: new Prisma.Decimal(0),
      discounts: new Prisma.Decimal(0),
      employeeMeals: new Prisma.Decimal(0),
      tips: new Prisma.Decimal(0),
      otherRevenue: new Prisma.Decimal(0),
      laborCost: new Prisma.Decimal(0),
      notes: null,
      snapshotFoodCost: new Prisma.Decimal(0),
      snapshotPaperCost: new Prisma.Decimal(0),
      snapshotCleaningCost: new Prisma.Decimal(0),
      snapshotExpensesByCategory: { Essence: 172.47 } as Prisma.JsonValue,
      snapshotTotalExpenses: new Prisma.Decimal(172.47),
      snapshotGrossRevenue: new Prisma.Decimal(0),
      snapshotNetRevenue: new Prisma.Decimal(0),
      snapshotNetProfit: new Prisma.Decimal(0),
      snapshotFoodCostPct: null,
      snapshotNetMarginPct: null,
      lockedAt: new Date('2026-07-31'),
      lockedBy: { id: 'u-1', name: 'Admin' },
      createdAt: new Date('2026-07-01'),
      updatedAt: new Date('2026-07-31'),
    });

    const service = makeService(prisma);
    const user = {
      id: 'u-1',
      email: 'admin@x',
      role: 'ADMIN' as const,
      branchId: 'b-1',
    };
    const dto = await service.getOrCreate('b-1', 7, 2026, user);

    expect(dto.status).toBe('LOCKED');
    expect(dto.expensesByCategory).toEqual({ Essence: 172.47 });
    // Preuve : aucun appel groupBy — les LOCKED lisent le snapshot, jamais
    // la table live.
    expect(prisma.accountingExpense.groupBy).not.toHaveBeenCalled();
  });

  it('11. unlock → futur read appelle serializeLive et donne HT', async () => {
    const prisma = buildPrismaMock();
    const locked = {
      id: 'r-1',
      branchId: 'b-1',
      month: 7,
      year: 2026,
      status: FinancialReportStatus.LOCKED,
      sales: new Prisma.Decimal(0),
      discounts: new Prisma.Decimal(0),
      employeeMeals: new Prisma.Decimal(0),
      tips: new Prisma.Decimal(0),
      otherRevenue: new Prisma.Decimal(0),
      laborCost: new Prisma.Decimal(0),
      notes: null,
      snapshotFoodCost: null,
      snapshotPaperCost: null,
      snapshotCleaningCost: null,
      snapshotExpensesByCategory: { Essence: 172.47 } as Prisma.JsonValue,
      snapshotTotalExpenses: new Prisma.Decimal(172.47),
      snapshotGrossRevenue: new Prisma.Decimal(0),
      snapshotNetRevenue: new Prisma.Decimal(0),
      snapshotNetProfit: new Prisma.Decimal(0),
      snapshotFoodCostPct: null,
      snapshotNetMarginPct: null,
      lockedAt: new Date(),
      lockedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // 1. findById → LOCKED
    prisma.financialReport.findUnique.mockResolvedValueOnce(locked);
    // 2. update → passe en DRAFT
    prisma.financialReport.update.mockResolvedValue({
      ...locked,
      status: FinancialReportStatus.DRAFT,
      lockedAt: null,
      lockedBy: null,
    });
    // 3. serializeLive va appeler computeLive → live HT
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    prisma.accountingExpense.groupBy.mockResolvedValue([grpRow('cat-1', 100)]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Essence' }]);

    const service = makeService(prisma);
    const user = {
      id: 'u-1',
      email: 'admin@x',
      role: 'ADMIN' as const,
      branchId: 'b-1',
    };
    const dto = await service.unlock('r-1', user);

    expect(dto.status).toBe('DRAFT');
    // Après unlock, on lit du LIVE : la nouvelle règle HT s'applique → 100
    // et NON plus le snapshot TTC 172.47.
    expect(dto.expensesByCategory).toEqual({ Essence: 100 });
  });

  it('12. amountBeforeTax=0 & totalAmount>0 : contribue 0 (aucun fallback TTC)', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    // Prisma renvoie 0 sur la somme HT (car les lignes ont amountBeforeTax=0)
    prisma.accountingExpense.groupBy.mockResolvedValue([grpRow('cat-oups', 0)]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([{ id: 'cat-oups', name: 'Oups' }]);

    const service = makeService(prisma);
    const res = await callComputeLive(service, draftReport());

    expect(res.expensesByCategory.Oups).toBe(0);
    expect(res.categoryTotal.toNumber()).toBe(0);
    // Preuve : aucune agrégation sur totalAmount n'a été demandée à Prisma.
    const call = prisma.accountingExpense.groupBy.mock.calls[0][0];
    expect(call._sum).toEqual({ amountBeforeTax: true });
    expect(call._sum).not.toEqual({ totalAmount: true });
  });

  it('13. Purchase mirrors exclus : sourceType != PURCHASE dans WHERE (défense en profondeur)', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    prisma.accountingExpense.groupBy.mockResolvedValue([]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([]);

    const service = makeService(prisma);
    await callComputeLive(service, draftReport());

    const call = prisma.accountingExpense.groupBy.mock.calls[0][0];
    expect(call.where.sourceType).toEqual({ not: 'PURCHASE' });
    expect(call.where.includeInFinancialReports).toBe(true);
  });

  it('14. Arrondi : le DTO livre des strings numériquement cohérentes', async () => {
    const prisma = buildPrismaMock();
    prisma.inventoryPeriod.findUnique.mockResolvedValue(null);
    // Ligne HT 33.33 pour tester la préservation de la précision Decimal
    prisma.accountingExpense.groupBy.mockResolvedValue([grpRow('cat-1', 33.33)]);
    prisma.laborEntry.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
    prisma.accountingCategory.findMany.mockResolvedValue([{ id: 'cat-1', name: 'X' }]);
    prisma.financialReport.findUnique.mockResolvedValue({
      id: 'r-1',
      branchId: 'b-1',
      month: 8,
      year: 2026,
      status: FinancialReportStatus.DRAFT,
      sales: new Prisma.Decimal(0),
      discounts: new Prisma.Decimal(0),
      employeeMeals: new Prisma.Decimal(0),
      tips: new Prisma.Decimal(0),
      otherRevenue: new Prisma.Decimal(0),
      laborCost: new Prisma.Decimal(0),
      notes: null,
      snapshotFoodCost: null,
      snapshotPaperCost: null,
      snapshotCleaningCost: null,
      snapshotExpensesByCategory: null,
      snapshotTotalExpenses: null,
      snapshotGrossRevenue: null,
      snapshotNetRevenue: null,
      snapshotNetProfit: null,
      snapshotFoodCostPct: null,
      snapshotNetMarginPct: null,
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });

    const service = makeService(prisma);
    const user = {
      id: 'u-1',
      email: 'admin@x',
      role: 'ADMIN' as const,
      branchId: 'b-1',
    };
    const dto = await service.getOrCreate('b-1', 8, 2026, user);
    expect(dto.expensesByCategory).toEqual({ X: 33.33 });
    // totalExpenses (Decimal → string) doit être parseable et cohérent
    expect(Number(dto.totalExpenses)).toBeCloseTo(33.33, 2);
  });
});
