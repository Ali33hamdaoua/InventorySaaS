/**
 * Hong Kong Sushi — demo seed.
 *
 * Two modes, switched by `SEED_DEMO_HISTORY`:
 *
 *   false (default) — CATALOG ONLY. Creates the branch, the owner account,
 *     the categories, the suppliers and the ~102 products, and leaves every
 *     figure at zero. The client enters their own purchases and inventory
 *     during the demo, which is what makes it convincing.
 *
 *   true — CATALOG + 4 MONTHS OF HISTORY. Additionally generates purchases,
 *     closed inventory periods, overheads and payroll so the dashboard and
 *     the food-cost curves are already populated. Useful for screenshots or
 *     for showing the reports without typing anything.
 *
 * Determinism
 *   Every random-looking number comes from `rand()`, a seeded PRNG. Re-running
 *   the seed produces identical data, so demo figures stay stable.
 *
 * Idempotence
 *   The branch, the user, the categories, the suppliers and the products are
 *   upserted. Transactional data (purchases, periods, expenses, labor,
 *   financial reports) is DELETED and rebuilt on every run — re-running would
 *   otherwise double every figure. Run `prisma/wipe-data.ts` for a full reset.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AccountingSourceType,
  CategoryType,
  ExpenseCategory,
  PeriodStatus,
  PaymentMethod,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

/**
 * Generate four months of purchases, inventories and expenses?
 *
 * Kept OFF so the demo starts from a clean slate: the catalog is ready but
 * every KPI reads zero until the client records their first purchase. Flip to
 * `true` to get a pre-populated dashboard instead — everything downstream is
 * already written and tested.
 */
const SEED_DEMO_HISTORY = false;

const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_NAME = 'Agadir';
const BRANCH_SLUG = 'agadir';

const OWNER_EMAIL = 'houbati@hongkong.ma';
const OWNER_PASSWORD = 'Houbati2026!';
const OWNER_NAME = 'Houbati';

/**
 * Months to generate, oldest first. The last one stays OPEN so the demo can
 * show a live period (and the "clôturer" workflow) on top of closed history.
 */
const MONTHS = [
  { year: 2026, month: 6, status: PeriodStatus.CLOSED, targetFoodCostPct: 33.4 },
  { year: 2026, month: 7, status: PeriodStatus.CLOSED, targetFoodCostPct: 32.1 },
  { year: 2026, month: 8, status: PeriodStatus.CLOSED, targetFoodCostPct: 30.8 },
  { year: 2026, month: 9, status: PeriodStatus.OPEN, targetFoodCostPct: null },
];

/** Monthly purchase budget per family, in MAD. Drives the generated volumes. */
const MONTHLY_BUDGET = {
  food: 148_000,
  packaging: 12_500,
  cleaning: 3_200,
};

/** Prices drift up slightly each month, as real supplier prices do. */
const MONTHLY_INFLATION = 0.008;

/** Ingredients a sushi kitchen burns through — they get a bigger share. */
const HIGH_VOLUME = [
  'riz', 'saumon', 'thon', 'nori', 'avocat', 'philadelphia', 'soja',
  'crevette', 'concombre', 'mayonnaise', 'poulet', 'vinaigre', 'huile',
  'sésame', 'surimi', 'tempura', 'nouilles',
];

/* ------------------------------------------------------------------ */
/* Seeded PRNG (mulberry32)                                            */
/* ------------------------------------------------------------------ */

let prngState = 0x6a09e667;

/** Uniform in [0, 1). Deterministic across runs and platforms. */
function rand(): number {
  prngState |= 0;
  prngState = (prngState + 0x6d2b79f5) | 0;
  let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform in [min, max). */
function randBetween(min: number, max: number): number {
  return min + rand() * (max - min);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(round2(n));
}

/* ------------------------------------------------------------------ */
/* Source data                                                         */
/* ------------------------------------------------------------------ */

interface RawProduct {
  name: string;
  category?: string;
  unit: string;
  unit_price_estimate_mad: number;
  supplier: string;
}

interface SeedData {
  suppliers: Array<{ name: string; type: string; note: string }>;
  ingredients: RawProduct[];
  packaging: RawProduct[];
  cleaning: RawProduct[];
}

function loadSeedData(): SeedData {
  // The JSON lives at the repo root, three levels above prisma/.
  const path = join(__dirname, '..', '..', '..', 'hongkong-sushi-seed-data.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as SeedData;
}

/* Category names, grouped by the cost family they roll up into. */
const FOOD_CATEGORIES = [
  'Poissons & fruits de mer',
  'Viandes',
  'Épicerie asiatique',
  'Crèmerie',
  'Fruits & légumes',
  'Épicerie sèche',
  'Boissons',
];
const PACKAGING_CATEGORY = 'Emballages';
const CLEANING_CATEGORY = "Produits d'entretien";

/** Monthly overheads, mirrored into the financial report. */
const OVERHEADS: Array<{
  category: string;
  description: string;
  amount: number;
  /** ± this fraction month to month, so the report is not perfectly flat. */
  variance: number;
  expenseCategory: ExpenseCategory;
  paymentMethod: PaymentMethod;
}> = [
  {
    category: 'Loyer',
    description: 'Loyer du local — Agadir',
    amount: 26_000,
    variance: 0,
    expenseCategory: ExpenseCategory.LOYER,
    paymentMethod: PaymentMethod.VIREMENT,
  },
  {
    category: 'Charges sociales (CNSS)',
    description: 'Cotisations CNSS & AMO',
    amount: 22_000,
    variance: 0.04,
    expenseCategory: ExpenseCategory.AUTRES,
    paymentMethod: PaymentMethod.VIREMENT,
  },
  {
    category: 'Électricité',
    description: 'Facture ONEE — électricité',
    amount: 11_500,
    variance: 0.16,
    expenseCategory: ExpenseCategory.ELECTRICITE,
    paymentMethod: PaymentMethod.PRELEVEMENT,
  },
  {
    category: 'Eau',
    description: 'Facture RAMSA — eau',
    amount: 2_400,
    variance: 0.14,
    expenseCategory: ExpenseCategory.AUTRES,
    paymentMethod: PaymentMethod.PRELEVEMENT,
  },
  {
    category: 'Internet & téléphone',
    description: 'Abonnement fibre + lignes mobiles',
    amount: 640,
    variance: 0.05,
    expenseCategory: ExpenseCategory.INTERNET_TELEPHONE,
    paymentMethod: PaymentMethod.PRELEVEMENT,
  },
  {
    category: 'Plateformes de livraison',
    description: 'Commissions Glovo / Jumia Food',
    amount: 14_500,
    variance: 0.2,
    expenseCategory: ExpenseCategory.PLATEFORMES_LIVRAISON,
    paymentMethod: PaymentMethod.VIREMENT,
  },
  {
    category: 'Marketing',
    description: 'Publicité réseaux sociaux + shooting photo',
    amount: 4_200,
    variance: 0.3,
    expenseCategory: ExpenseCategory.MARKETING,
    paymentMethod: PaymentMethod.CARTE,
  },
  {
    category: 'Frais bancaires',
    description: 'Tenue de compte + commissions TPE',
    amount: 1_900,
    variance: 0.12,
    expenseCategory: ExpenseCategory.FRAIS_BANCAIRES,
    paymentMethod: PaymentMethod.PRELEVEMENT,
  },
  {
    category: 'Carburant & véhicules',
    description: 'Carburant et entretien des scooters de livraison',
    amount: 6_200,
    variance: 0.18,
    expenseCategory: ExpenseCategory.AUTRES,
    paymentMethod: PaymentMethod.ESPECES,
  },
  {
    category: 'Maintenance',
    description: 'Entretien équipement cuisine & froid',
    amount: 3_800,
    variance: 0.4,
    expenseCategory: ExpenseCategory.MAINTENANCE,
    paymentMethod: PaymentMethod.VIREMENT,
  },
  {
    category: 'Assurances',
    description: 'Assurance local & responsabilité civile',
    amount: 1_900,
    variance: 0,
    expenseCategory: ExpenseCategory.AUTRES,
    paymentMethod: PaymentMethod.PRELEVEMENT,
  },
  {
    category: 'Honoraires comptables',
    description: 'Cabinet comptable — mission mensuelle',
    amount: 2_500,
    variance: 0,
    expenseCategory: ExpenseCategory.AUTRES,
    paymentMethod: PaymentMethod.VIREMENT,
  },
  {
    category: 'Taxes & licences',
    description: 'Taxe professionnelle, licences, redevances',
    amount: 1_600,
    variance: 0.1,
    expenseCategory: ExpenseCategory.AUTRES,
    paymentMethod: PaymentMethod.VIREMENT,
  },
  {
    category: 'Amortissements',
    description: 'Amortissement matériel de cuisine & mobilier',
    amount: 9_000,
    variance: 0,
    expenseCategory: ExpenseCategory.AUTRES,
    paymentMethod: PaymentMethod.AUTRE,
  },
];

/** Payroll. Rates are monthly-equivalent hours × an hourly rate in MAD. */
const STAFF: Array<{ name: string; role: string; hours: number; rate: number }> = [
  { name: 'Youssef Benali', role: 'Chef sushi', hours: 208, rate: 55 },
  { name: 'Rachid El Amrani', role: 'Second de cuisine', hours: 208, rate: 40 },
  { name: 'Karim Sabri', role: 'Sushiman', hours: 200, rate: 32 },
  { name: 'Othmane Lahlou', role: 'Sushiman', hours: 200, rate: 30 },
  { name: 'Salma Idrissi', role: 'Commis sushi', hours: 192, rate: 22 },
  { name: 'Anas Bekkali', role: 'Commis sushi', hours: 192, rate: 20 },
  { name: 'Mehdi Ouhadi', role: 'Chef wok', hours: 208, rate: 35 },
  { name: 'Hicham Naciri', role: 'Cuisinier chaud', hours: 200, rate: 26 },
  { name: 'Yassine Alaoui', role: 'Commis cuisine', hours: 192, rate: 19 },
  { name: 'Brahim Oulad', role: 'Plonge', hours: 176, rate: 17 },
  { name: 'Nadia Fassi', role: 'Plonge & entretien', hours: 176, rate: 17 },
  { name: 'Imane Tazi', role: 'Responsable de salle', hours: 208, rate: 30 },
  { name: 'Sofia Berrada', role: 'Serveuse', hours: 192, rate: 20 },
  { name: 'Khalil Mansouri', role: 'Serveur', hours: 192, rate: 20 },
  { name: 'Zineb Chraibi', role: 'Serveuse', hours: 180, rate: 19 },
  { name: 'Leila Amrani', role: 'Caisse', hours: 192, rate: 21 },
  { name: 'Hamza Bouzid', role: 'Livreur', hours: 200, rate: 19 },
  { name: 'Ayoub Ziani', role: 'Livreur', hours: 200, rate: 19 },
  { name: 'Reda Cherkaoui', role: 'Livreur', hours: 180, rate: 18 },
  { name: 'Fatima Zahra Hilali', role: 'Agent d’entretien', hours: 176, rate: 17 },
  { name: 'Omar Sekkat', role: 'Responsable achats', hours: 200, rate: 33 },
];

const ACCOUNTING_CATEGORIES = [
  'Achats fournisseurs',
  'Loyer',
  'Charges sociales (CNSS)',
  'Électricité',
  'Eau',
  'Internet & téléphone',
  'Plateformes de livraison',
  'Marketing',
  'Frais bancaires',
  'Main-d’œuvre',
  'Maintenance',
  'Carburant & véhicules',
  'Assurances',
  'Honoraires comptables',
  'Taxes & licences',
  'Amortissements',
];

/* ------------------------------------------------------------------ */
/* Structural seeding                                                  */
/* ------------------------------------------------------------------ */

async function seedBranch() {
  return prisma.branch.upsert({
    where: { id: BRANCH_ID },
    update: { name: BRANCH_NAME, slug: BRANCH_SLUG, isActive: true },
    create: {
      id: BRANCH_ID,
      name: BRANCH_NAME,
      slug: BRANCH_SLUG,
      address: 'Agadir, Maroc',
      isActive: true,
    },
  });
}

/**
 * The `add_branch_multi_location_support` migration hard-codes two Quebec
 * branches (Joliette + Bishop). `seedBranch()` reuses the first id and renames
 * it; this drops the leftover second one so the branch switcher shows only
 * Agadir. Guarded: a branch that actually holds data is left alone.
 */
async function removeLegacyBranches() {
  const strays = await prisma.branch.findMany({ where: { id: { not: BRANCH_ID } } });
  for (const b of strays) {
    const [products, purchases, periods, expenses] = await Promise.all([
      prisma.inventoryProduct.count({ where: { branchId: b.id } }),
      prisma.purchase.count({ where: { branchId: b.id } }),
      prisma.inventoryPeriod.count({ where: { branchId: b.id } }),
      prisma.accountingExpense.count({ where: { branchId: b.id } }),
    ]);
    if (products || purchases || periods || expenses) {
      // eslint-disable-next-line no-console
      console.log(`   ⚠️  Succursale « ${b.name} » conservée : elle contient des données.`);
      continue;
    }
    await prisma.branch.delete({ where: { id: b.id } });
    // eslint-disable-next-line no-console
    console.log(`   Succursale héritée « ${b.name} » supprimée (vide).`);
  }
}

async function seedOwner() {
  const passwordHash = await argon2.hash(OWNER_PASSWORD);
  return prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    // Re-hash on every run so the documented credentials always work, but
    // leave the rest of the row alone.
    update: { passwordHash, isActive: true, role: UserRole.OWNER },
    create: {
      name: OWNER_NAME,
      email: OWNER_EMAIL,
      passwordHash,
      role: UserRole.OWNER,
      branchId: null, // cross-branch access
      isActive: true,
    },
  });
}

async function seedCategories() {
  const byName = new Map<string, string>();

  const all: Array<[string, CategoryType]> = [
    ...FOOD_CATEGORIES.map((n) => [n, CategoryType.FOOD] as [string, CategoryType]),
    [PACKAGING_CATEGORY, CategoryType.PAPIERS],
    [CLEANING_CATEGORY, CategoryType.NETTOYAGE],
  ];

  for (const [name, categoryType] of all) {
    const row = await prisma.category.upsert({
      where: { name },
      update: { categoryType, isActive: true },
      create: { name, categoryType, isActive: true },
    });
    byName.set(name, row.id);
  }
  return byName;
}

async function seedAccountingCategories() {
  const byName = new Map<string, string>();
  for (const name of ACCOUNTING_CATEGORIES) {
    const row = await prisma.accountingCategory.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
    byName.set(name, row.id);
  }
  return byName;
}

async function seedSuppliers(data: SeedData) {
  const byName = new Map<string, string>();
  for (const s of data.suppliers) {
    const existing = await prisma.supplier.findFirst({ where: { name: s.name } });
    const row = existing
      ? await prisma.supplier.update({
          where: { id: existing.id },
          data: { notes: `${s.type} — ${s.note}`, isActive: true },
        })
      : await prisma.supplier.create({
          data: { name: s.name, notes: `${s.type} — ${s.note}`, isActive: true },
        });
    byName.set(s.name, row.id);
  }
  return byName;
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

type Family = 'food' | 'packaging' | 'cleaning';

interface SeededProduct {
  id: string;
  name: string;
  unit: string;
  family: Family;
  supplierId: string;
  basePrice: number;
  /** Units consumed per month at cruising speed. */
  monthlyQty: number;
}

async function seedProducts(
  data: SeedData,
  categories: Map<string, string>,
  suppliers: Map<string, string>,
): Promise<SeededProduct[]> {
  const specs: Array<{ raw: RawProduct; family: Family; categoryName: string }> = [
    ...data.ingredients.map((raw) => ({
      raw,
      family: 'food' as Family,
      categoryName: raw.category ?? 'Épicerie sèche',
    })),
    ...data.packaging.map((raw) => ({
      raw,
      family: 'packaging' as Family,
      categoryName: PACKAGING_CATEGORY,
    })),
    ...data.cleaning.map((raw) => ({
      raw,
      family: 'cleaning' as Family,
      categoryName: CLEANING_CATEGORY,
    })),
  ];

  // A weight per product, then scaled so each family hits its monthly budget.
  const weights = specs.map(({ raw }) => {
    const lower = raw.name.toLowerCase();
    const isCore = HIGH_VOLUME.some((k) => lower.includes(k));
    return randBetween(0.35, 1) * (isCore ? 2.6 : 1);
  });

  const budgetShare = new Map<Family, number>();
  for (const family of ['food', 'packaging', 'cleaning'] as Family[]) {
    const total = specs.reduce(
      (s, spec, i) => (spec.family === family ? s + weights[i] : s),
      0,
    );
    budgetShare.set(family, total);
  }

  const out: SeededProduct[] = [];

  for (let i = 0; i < specs.length; i += 1) {
    const { raw, family, categoryName } = specs[i];
    const categoryId = categories.get(categoryName) ?? null;
    const supplierId = suppliers.get(raw.supplier);
    if (!supplierId) throw new Error(`Fournisseur inconnu : ${raw.supplier}`);

    const basePrice = raw.unit_price_estimate_mad;
    const share = weights[i] / (budgetShare.get(family) || 1);
    const rawQty = (MONTHLY_BUDGET[family] * share) / basePrice;

    // Whole units for countable things, one decimal for weighed/volume ones.
    const countable = !['kg', 'l', 'L'].includes(raw.unit);
    const monthlyQty = countable
      ? Math.max(1, Math.round(rawQty))
      : Math.max(0.5, Math.round(rawQty * 10) / 10);

    const existing = await prisma.inventoryProduct.findFirst({
      where: { branchId: BRANCH_ID, name: raw.name },
    });

    const payload = {
      branchId: BRANCH_ID,
      name: raw.name,
      unit: raw.unit,
      categoryId,
      supplierId,
      defaultCost: dec(basePrice),
      // Without generated history there is no consumption to derive a
      // threshold from — leave it at 0 so the dashboard does not report
      // fake "stock critique" alerts on day one.
      minStockLevel: SEED_DEMO_HISTORY ? dec(monthlyQty * 0.15) : dec(0),
      isActive: true,
    };

    const row = existing
      ? await prisma.inventoryProduct.update({ where: { id: existing.id }, data: payload })
      : await prisma.inventoryProduct.create({ data: payload });

    out.push({
      id: row.id,
      name: raw.name,
      unit: raw.unit,
      family,
      supplierId,
      basePrice,
      monthlyQty,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Transactional history                                               */
/* ------------------------------------------------------------------ */

/**
 * Removes everything this seed generates on a previous run. Structural rows
 * (branch, user, categories, suppliers, products) are upserted instead, so
 * they survive and keep their ids.
 */
async function wipeHistory() {
  await prisma.accountingExpense.deleteMany({ where: { branchId: BRANCH_ID } });
  await prisma.laborEntry.deleteMany({ where: { branchId: BRANCH_ID } });
  await prisma.repairEntry.deleteMany({ where: { branchId: BRANCH_ID } });
  await prisma.purchaseAdditionalCost.deleteMany({ where: { branchId: BRANCH_ID } });
  await prisma.purchaseItem.deleteMany({ where: { purchase: { branchId: BRANCH_ID } } });
  await prisma.purchase.deleteMany({ where: { branchId: BRANCH_ID } });
  await prisma.inventoryLine.deleteMany({ where: { period: { branchId: BRANCH_ID } } });
  await prisma.inventoryReport.deleteMany({ where: { period: { branchId: BRANCH_ID } } });
  await prisma.inventoryPeriod.deleteMany({ where: { branchId: BRANCH_ID } });
  await prisma.financialReport.deleteMany({ where: { branchId: BRANCH_ID } });
}

/** UTC date at a given day of a month — avoids the local-timezone off-by-one. */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

interface MonthPurchaseTotals {
  /** productId → { qty, value } bought during the month. */
  byProduct: Map<string, { qty: number; value: number }>;
}

/**
 * Creates the month's supplier invoices and returns what was bought per
 * product, which the inventory lines then consume.
 *
 * Each supplier is invoiced several times a month (fresh fish more often than
 * cleaning supplies), and each product's monthly volume is split across that
 * supplier's invoices.
 */
async function seedPurchasesForMonth(
  products: SeededProduct[],
  year: number,
  month: number,
  monthIndex: number,
  /** Fraction of the month already elapsed — < 1 for the open period. */
  completion: number,
): Promise<MonthPurchaseTotals> {
  const priceFactor = (1 + MONTHLY_INFLATION) ** monthIndex;
  const byProduct = new Map<string, { qty: number; value: number }>();

  const bySupplier = new Map<string, SeededProduct[]>();
  for (const p of products) {
    const list = bySupplier.get(p.supplierId) ?? [];
    list.push(p);
    bySupplier.set(p.supplierId, list);
  }

  const lastDay = daysInMonth(year, month);

  for (const [supplierId, supplierProducts] of bySupplier) {
    // Perishables come in weekly; dry goods and cleaning far less often.
    const isFresh = supplierProducts.some((p) => p.family === 'food');
    const invoiceCount = Math.max(1, Math.round((isFresh ? 4 : 2) * completion));

    for (let inv = 0; inv < invoiceCount; inv += 1) {
      // Spread invoices across the elapsed part of the month.
      const span = lastDay * completion;
      const day = Math.min(
        lastDay,
        Math.max(1, Math.round(((inv + 0.5) / invoiceCount) * span)),
      );

      const items: Array<{ productId: string; quantity: number; unitPrice: number }> = [];

      for (const p of supplierProducts) {
        // Not every product is on every invoice — that would look synthetic.
        if (invoiceCount > 1 && rand() < 0.25) continue;

        const target = (p.monthlyQty * completion) / invoiceCount;
        const qty = target * randBetween(0.75, 1.3);
        if (qty <= 0) continue;

        const countable = !['kg', 'l', 'L'].includes(p.unit);
        const quantity = countable
          ? Math.max(1, Math.round(qty))
          : Math.max(0.1, Math.round(qty * 100) / 100);

        const unitPrice = round2(p.basePrice * priceFactor * randBetween(0.97, 1.04));
        items.push({ productId: p.id, quantity, unitPrice });

        const acc = byProduct.get(p.id) ?? { qty: 0, value: 0 };
        acc.qty += quantity;
        acc.value += round2(quantity * unitPrice);
        byProduct.set(p.id, acc);
      }

      if (items.length === 0) continue;

      const subtotal = round2(
        items.reduce((s, i) => s + round2(i.quantity * i.unitPrice), 0),
      );

      await prisma.purchase.create({
        data: {
          branchId: BRANCH_ID,
          supplierId,
          purchaseDate: utcDate(year, month, day),
          subtotalHT: dec(subtotal),
          totalAmount: dec(subtotal),
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              quantity: dec(i.quantity),
              unitPrice: new Prisma.Decimal(i.unitPrice),
              totalPrice: dec(i.quantity * i.unitPrice),
            })),
          },
        },
      });
    }
  }

  return { byProduct };
}

interface StockState {
  /** productId → quantity on hand at the start of the month. */
  qty: Map<string, number>;
  /** productId → unit cost of that opening stock. */
  cost: Map<string, number>;
}

/**
 * Builds one inventory period: its lines, its report, and the stock state
 * handed to the next month.
 *
 * The invariants the app relies on are computed here exactly as the close()
 * service would, so a demo user reopening and re-closing a period sees the
 * same numbers:
 *     realCost  = openingValue + purchasesValue − closingValue
 *     realCost  = foodCost + paperCost + cleaningCost
 */
/** Revenue of the most recently closed month — the open month builds on it. */
const LAST_CLOSED_SALES: { value: number | null } = { value: null };

interface PeriodOutcome {
  stock: StockState;
  /** Revenue the period was calibrated against — reused by the P&L. */
  salesRevenue: number;
}

async function seedPeriod(
  products: SeededProduct[],
  opening: StockState,
  spec: (typeof MONTHS)[number],
  monthIndex: number,
  completion: number,
): Promise<PeriodOutcome> {
  const { year, month, status } = spec;
  const lastDay = daysInMonth(year, month);

  const period = await prisma.inventoryPeriod.create({
    data: {
      branchId: BRANCH_ID,
      year,
      month,
      status,
      openingDate: utcDate(year, month, 1),
      closingDate: status === PeriodStatus.CLOSED ? utcDate(year, month, lastDay) : null,
    },
  });

  const purchases = await seedPurchasesForMonth(
    products,
    year,
    month,
    monthIndex,
    completion,
  );

  const priceFactor = (1 + MONTHLY_INFLATION) ** monthIndex;
  const next: StockState = { qty: new Map(), cost: new Map() };

  const buckets = {
    food: { opening: 0, purchases: 0, closing: 0 },
    packaging: { opening: 0, purchases: 0, closing: 0 },
    cleaning: { opening: 0, purchases: 0, closing: 0 },
  };

  for (const p of products) {
    const bought = purchases.byProduct.get(p.id) ?? { qty: 0, value: 0 };

    const openingQty = opening.qty.get(p.id) ?? 0;
    const openingUnitCost = opening.cost.get(p.id) ?? p.basePrice;

    // Closing stock hovers around ~10 days of cover, with a little drift so
    // consumption is never a perfect mirror of purchases.
    const targetCover = (p.monthlyQty / 30) * randBetween(8, 13) * completion;
    const countable = !['kg', 'l', 'L'].includes(p.unit);
    let closingQty = countable
      ? Math.max(0, Math.round(targetCover))
      : Math.max(0, Math.round(targetCover * 10) / 10);

    // Can't consume more than what was available.
    const available = openingQty + bought.qty;
    if (closingQty > available) closingQty = round2(available);

    const closingUnitCost = round2(p.basePrice * priceFactor);
    const consumptionQty = round2(available - closingQty);

    const openingValue = round2(openingQty * openingUnitCost);
    const closingValue = round2(closingQty * closingUnitCost);
    const consumptionValue = round2(openingValue + bought.value - closingValue);

    await prisma.inventoryLine.create({
      data: {
        periodId: period.id,
        productId: p.id,
        openingQuantity: dec(openingQty),
        openingUnitCost: new Prisma.Decimal(openingUnitCost),
        closingQuantity: dec(closingQty),
        closingUnitCost: new Prisma.Decimal(closingUnitCost),
        purchasesQuantity: dec(bought.qty),
        purchasesValue: dec(bought.value),
        consumptionQuantity: dec(consumptionQty),
        consumptionValue: dec(consumptionValue),
      },
    });

    const bucket = buckets[p.family];
    bucket.opening += openingValue;
    bucket.purchases += bought.value;
    bucket.closing += closingValue;

    next.qty.set(p.id, closingQty);
    next.cost.set(p.id, closingUnitCost);
  }

  const openingValue = round2(
    buckets.food.opening + buckets.packaging.opening + buckets.cleaning.opening,
  );
  const purchasesValue = round2(
    buckets.food.purchases + buckets.packaging.purchases + buckets.cleaning.purchases,
  );
  const closingValue = round2(
    buckets.food.closing + buckets.packaging.closing + buckets.cleaning.closing,
  );

  const foodCost = round2(
    buckets.food.opening + buckets.food.purchases - buckets.food.closing,
  );
  const paperCost = round2(
    buckets.packaging.opening + buckets.packaging.purchases - buckets.packaging.closing,
  );
  const cleaningCost = round2(
    buckets.cleaning.opening + buckets.cleaning.purchases - buckets.cleaning.closing,
  );
  // Derived from the families so `realCost = food + paper + cleaning` holds
  // exactly, rather than letting rounding split the two definitions apart.
  const realCost = round2(foodCost + paperCost + cleaningCost);

  let salesRevenue: number;

  // Only closed periods carry a report — an open one has nothing to freeze.
  if (status === PeriodStatus.CLOSED && spec.targetFoodCostPct !== null) {
    // Revenue is derived from the target ratio, then rounded to a plausible
    // till figure; the stored percentage is recomputed from that rounded
    // number so the report stays internally consistent.
    salesRevenue = Math.round(realCost / (spec.targetFoodCostPct / 100) / 100) * 100;
    LAST_CLOSED_SALES.value = salesRevenue;
    const foodCostPercentage = round2((realCost / salesRevenue) * 100);

    await prisma.inventoryReport.create({
      data: {
        periodId: period.id,
        openingValue: dec(openingValue),
        purchasesValue: dec(purchasesValue),
        closingValue: dec(closingValue),
        realCost: dec(realCost),
        foodCost: dec(foodCost),
        paperCost: dec(paperCost),
        cleaningCost: dec(cleaningCost),
        salesRevenue: dec(salesRevenue),
        foodCostPercentage: new Prisma.Decimal(foodCostPercentage),
        generatedAt: utcDate(year, month, lastDay),
      },
    });

    // eslint-disable-next-line no-console
    console.log(
      `   ${String(month).padStart(2, '0')}/${year} — achats ${purchasesValue.toLocaleString('fr-MA')} DH · ` +
        `coût réel ${realCost.toLocaleString('fr-MA')} DH · CA ${salesRevenue.toLocaleString('fr-MA')} DH · ` +
        `food cost ${foodCostPercentage} %`,
    );
  } else {
    // Open month: revenue booked so far. Extrapolated from the last closed
    // month and scaled by how much of the month has elapsed, rather than
    // derived from realCost — an uncounted period has no reliable food cost.
    const previousSales = LAST_CLOSED_SALES.value ?? 420_000;
    salesRevenue = Math.round((previousSales * 1.04 * completion) / 100) * 100;
    // eslint-disable-next-line no-console
    console.log(
      `   ${String(month).padStart(2, '0')}/${year} — période OUVERTE · ` +
        `achats ${purchasesValue.toLocaleString('fr-MA')} DH en cours`,
    );
  }

  return { stock: next, salesRevenue };
}

/* ------------------------------------------------------------------ */
/* Overheads & payroll                                                 */
/* ------------------------------------------------------------------ */

/**
 * The financial report keeps its OWN revenue fields — they are not read from
 * `InventoryReport.salesRevenue`. Without these rows the P&L page shows a
 * month with zero sales and a large fake loss.
 */
async function seedFinancialReports(revenueByMonth: Map<string, number>) {
  for (const spec of MONTHS) {
    const key = `${spec.year}-${spec.month}`;
    const sales = revenueByMonth.get(key) ?? 0;

    // Plausible deductions on top of gross sales.
    const discounts = round2(sales * randBetween(0.012, 0.022));
    const employeeMeals = round2(sales * randBetween(0.006, 0.011));
    const tips = round2(sales * randBetween(0.004, 0.009));

    const labor = await prisma.laborEntry.aggregate({
      where: {
        branchId: BRANCH_ID,
        date: {
          gte: utcDate(spec.year, spec.month, 1),
          lte: utcDate(spec.year, spec.month, daysInMonth(spec.year, spec.month)),
        },
      },
      _sum: { totalAmount: true },
    });

    await prisma.financialReport.create({
      data: {
        branchId: BRANCH_ID,
        year: spec.year,
        month: spec.month,
        status: 'DRAFT',
        sales: dec(sales),
        discounts: dec(discounts),
        employeeMeals: dec(employeeMeals),
        tips: dec(tips),
        otherRevenue: dec(0),
        laborCost: labor._sum.totalAmount ?? dec(0),
      },
    });
  }
}

async function seedOverheads(accountingCategories: Map<string, string>) {
  for (const spec of MONTHS) {
    for (const o of OVERHEADS) {
      const categoryId = accountingCategories.get(o.category);
      if (!categoryId) throw new Error(`Catégorie comptable inconnue : ${o.category}`);

      const amount = round2(o.amount * (1 + randBetween(-o.variance, o.variance)));
      await prisma.accountingExpense.create({
        data: {
          branchId: BRANCH_ID,
          expenseDate: utcDate(spec.year, spec.month, 5),
          category: o.expenseCategory,
          accountingCategoryId: categoryId,
          description: o.description,
          paymentMethod: o.paymentMethod,
          amountBeforeTax: dec(amount),
          totalAmount: dec(amount),
          sourceType: AccountingSourceType.MANUAL,
          // These are real P&L lines — they belong in the financial report.
          includeInFinancialReports: true,
        },
      });
    }
  }
}

async function seedPayroll(accountingCategories: Map<string, string>) {
  const laborCategoryId = accountingCategories.get('Main-d’œuvre');
  if (!laborCategoryId) throw new Error('Catégorie comptable « Main-d’œuvre » manquante');

  for (const spec of MONTHS) {
    const lastDay = daysInMonth(spec.year, spec.month);
    for (const s of STAFF) {
      const hours = Math.round(s.hours * randBetween(0.94, 1.06));
      const total = round2(hours * s.rate);

      const entry = await prisma.laborEntry.create({
        data: {
          branchId: BRANCH_ID,
          date: utcDate(spec.year, spec.month, lastDay),
          employeeName: s.name,
          role: s.role,
          hours: dec(hours),
          hourlyRate: dec(s.rate),
          totalAmount: dec(total),
        },
      });

      // The Labor module mirrors each entry into accounting 1-to-1; the seed
      // writes the mirror directly since it bypasses the service layer.
      await prisma.accountingExpense.create({
        data: {
          branchId: BRANCH_ID,
          expenseDate: utcDate(spec.year, spec.month, lastDay),
          category: ExpenseCategory.MAIN_DOEUVRE,
          accountingCategoryId: laborCategoryId,
          description: `${s.name} — ${s.role}`,
          amountBeforeTax: dec(total),
          totalAmount: dec(total),
          sourceType: AccountingSourceType.LABOR,
          laborId: entry.id,
          // Labor is reported as its own line item in the financial report,
          // so the expense bucket must not double-count it.
          includeInFinancialReports: false,
        },
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

async function main() {
  /* eslint-disable no-console */
  const data = loadSeedData();

  console.log('🏢 Succursale…');
  await seedBranch();
  await removeLegacyBranches();

  console.log('👤 Compte propriétaire…');
  await seedOwner();

  console.log('🗂️  Catégories produits & comptables…');
  const categories = await seedCategories();
  const accountingCategories = await seedAccountingCategories();

  console.log('🚚 Fournisseurs…');
  const suppliers = await seedSuppliers(data);

  console.log('🍣 Produits…');
  const products = await seedProducts(data, categories, suppliers);
  console.log(`   ${products.length} produits créés`);

  console.log('🧹 Nettoyage de l’historique de démo précédent…');
  await wipeHistory();

  if (!SEED_DEMO_HISTORY) {
    console.log('');
    console.log('✅ Seed Hong Kong Sushi terminé — catalogue seul.');
    console.log(`   ${products.length} produits, ${data.suppliers.length} fournisseurs, 9 catégories.`);
    console.log('   Aucun achat, aucune période, aucune dépense : tous les compteurs sont à 0.');
    console.log('   Le client saisit ses achats et son inventaire depuis l’application.');
    console.log(`   Connexion : ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
    return;
  }

  console.log('📦 Achats & périodes d’inventaire…');
  let stock: StockState = { qty: new Map(), cost: new Map() };
  // Month 1 opens with roughly a third of a month of stock already on hand —
  // a restaurant that has been running, not one opening its doors.
  for (const p of products) {
    const initial = round2(p.monthlyQty * randBetween(0.25, 0.4));
    stock.qty.set(p.id, initial);
    stock.cost.set(p.id, p.basePrice);
  }

  const revenueByMonth = new Map<string, number>();
  for (let i = 0; i < MONTHS.length; i += 1) {
    const spec = MONTHS[i];
    // The last month is the live one — only part of it has happened.
    const completion = spec.status === PeriodStatus.OPEN ? 0.7 : 1;
    const outcome = await seedPeriod(products, stock, spec, i, completion);
    stock = outcome.stock;
    revenueByMonth.set(`${spec.year}-${spec.month}`, outcome.salesRevenue);
  }

  console.log('🧾 Charges fixes…');
  await seedOverheads(accountingCategories);

  console.log('👥 Main-d’œuvre…');
  await seedPayroll(accountingCategories);

  console.log('📊 Rapports financiers mensuels…');
  await seedFinancialReports(revenueByMonth);

  console.log('');
  console.log('✅ Seed Hong Kong Sushi terminé.');
  console.log(`   Connexion : ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  /* eslint-enable no-console */
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
