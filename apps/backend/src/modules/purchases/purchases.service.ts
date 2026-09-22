import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingSourceType,
  ExpenseCategory,
  PeriodStatus,
  Prisma,
} from '@prisma/client';
import { calculatePurchaseTotals, canBypassClosedPeriod } from '@inventorymdb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { ListPurchasesDto } from './dto/list-purchases.dto';
import { PurchaseSummaryQueryDto } from './dto/summary-purchases.dto';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import {
  resolveBranchForMutation,
  resolveBranchScope,
} from '../../common/helpers/branch-scope.helper';
import {
  monthStartUTC,
  monthEndExclusiveUTC,
} from '../../common/helpers/business-date.helper';
import { AccountingCategoriesService } from '../accounting-categories/accounting-categories.service';

const PURCHASE_INCLUDE = {
  supplier: {
    select: { id: true, name: true, contactName: true },
  },
  items: {
    include: {
      // isActive est exposé afin que l'UI puisse afficher un badge « Inactif »
      // sur les lignes historiques dont le produit a été désactivé après
      // coup. Purement descriptif — aucune règle de calcul ne le consomme.
      product: { select: { id: true, name: true, unit: true, isActive: true } },
    },
  },
  // Frais supplémentaires (essence/livraison/…). N'affecte AUCUN calcul
  // d'inventaire — ces frais sont mirrorés vers `AccountingExpense` avec
  // `sourceType=PURCHASE_ADDITIONAL_COST` (inclus dans le rapport en HT).
  additionalCosts: {
    include: {
      accountingCategory: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

/**
 * Wire format — Prisma Decimal columns are forced to strings here so the
 * global ClassSerializerInterceptor never emits the opaque `{s, e, d}`
 * shape (which surfaces as `NaN`/`0` on the frontend). Mirrors the pattern
 * used by ProductsService and AccountingService.
 */
type PurchaseRow = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

function serializePurchase(p: PurchaseRow) {
  const serializedAdditionalCosts = p.additionalCosts.map((c) => ({
    ...c,
    amountBeforeTax: c.amountBeforeTax.toString(),
    tpsAmount: c.tpsAmount.toString(),
    tvqAmount: c.tvqAmount.toString(),
    totalAmount: c.totalAmount.toString(),
  }));

  // Compute invoice-level totals that include additional costs.
  // These are DTO-only — they NEVER affect Purchase.totalAmount, WAC,
  // PurchaseItem.unitPrice, Product.defaultCost, or any inventory calc.
  const additionalCostsTotalHT = p.additionalCosts.reduce(
    (s, c) => s + Number(c.amountBeforeTax),
    0,
  );
  const additionalCostsTotalTTC = p.additionalCosts.reduce(
    (s, c) => s + Number(c.totalAmount),
    0,
  );
  const productsTotalTTC = Number(p.totalAmount);
  const invoiceGrandTotal = roundToCents(productsTotalTTC + additionalCostsTotalTTC);

  return {
    ...p,
    subtotalHT: p.subtotalHT.toString(),
    tpsAmount: p.tpsAmount.toString(),
    tvqAmount: p.tvqAmount.toString(),
    totalAmount: p.totalAmount.toString(),
    items: p.items.map((it) => ({
      ...it,
      quantity: it.quantity.toString(),
      unitPrice: it.unitPrice.toString(),
      totalPrice: it.totalPrice.toString(),
    })),
    additionalCosts: serializedAdditionalCosts,
    // Invoice-level computed fields (products + additional costs combined).
    additionalCostsTotalHT: additionalCostsTotalHT.toFixed(2),
    additionalCostsTotalTTC: additionalCostsTotalTTC.toFixed(2),
    invoiceGrandTotal: invoiceGrandTotal.toFixed(2),
  };
}


@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingCategories: AccountingCategoriesService,
  ) {}

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /** Returns the InventoryPeriod of a given branch that contains the date, or null. */
  private async findPeriodForDate(branchId: string, date: Date) {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return this.prisma.inventoryPeriod.findUnique({
      where: { branchId_year_month: { branchId, year, month } },
    });
  }

  /** Throws if the period covering `date` is CLOSED and the caller is not an ADMIN. */
  private async assertPeriodEditable(
    branchId: string,
    date: Date,
    user: RequestUser | undefined,
  ) {
    const period = await this.findPeriodForDate(branchId, date);
    if (period?.status === PeriodStatus.CLOSED && !canBypassClosedPeriod(user?.role)) {
      throw new ForbiddenException(
        `La période ${period.month}/${period.year} est clôturée. Seul un OWNER ou ADMIN peut modifier ses achats.`,
      );
    }
  }

  /**
   * Vérifie que chaque productId existe ET appartient à la succursale.
   *
   * Avec `options.requireActive = true`, exige aussi `isActive=true`. Utilisé
   * sur la CRÉATION d'un nouvel achat (garde-fou opérationnel : un produit
   * désactivé ne doit plus alimenter de nouvelles écritures).
   *
   * En UPDATE, ce flag n'est appliqué qu'aux nouveaux productIds ajoutés à
   * l'achat — les productIds déjà présents sur l'achat existant restent
   * modifiables même s'ils ont été désactivés depuis (contexte HISTORIQUE).
   */
  private async assertProductsBelongToBranch(
    branchId: string,
    productIds: string[],
    options: { requireActive?: boolean } = {},
  ) {
    if (productIds.length === 0) return;
    const unique = Array.from(new Set(productIds));
    const found = await this.prisma.inventoryProduct.findMany({
      where: { id: { in: unique }, branchId },
      select: { id: true, name: true, isActive: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException(
        'Un ou plusieurs produits sont introuvables ou appartiennent à une autre succursale',
      );
    }
    if (options.requireActive) {
      const inactive = found.filter((p) => !p.isActive);
      if (inactive.length > 0) {
        const names = inactive.map((p) => `« ${p.name} »`).join(', ');
        const plural = inactive.length > 1 ? 's' : '';
        throw new BadRequestException(
          `Produit${plural} désactivé${plural} : ${names}. Un produit désactivé ne peut pas être ajouté à un nouvel achat.`,
        );
      }
    }
  }

  /**
   * Authoritative purchase totals.
   *
   * Subtotal HT = Σ (line.quantity × line.unitPrice), always derived from
   * the items. TPS and TVQ are taken FROM USER INPUT — we no longer apply
   * 5 % / 9.975 % automatically; some invoices have partial / zero / custom
   * tax (e.g. reimbursements, mixed taxable + exempt). The backend only
   * enforces the invariant `total = subtotal + tps + tvq`.
   */
  private computeTotals(
    items: Array<{ quantity: number; unitPrice: number }>,
    tpsInput: number,
    tvqInput: number,
  ) {
    return calculatePurchaseTotals(items, tpsInput, tvqInput);
  }

  // -------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------

  async findAll(q: ListPurchasesDto, user?: RequestUser) {
    const scope = resolveBranchScope(user, q.branchId);
    const and: Prisma.PurchaseWhereInput[] = [];
    if (scope) and.push({ branchId: scope });
    if (q.search) {
      and.push({
        OR: [
          { supplier: { name: { contains: q.search, mode: 'insensitive' } } },
          { note: { contains: q.search, mode: 'insensitive' } },
        ],
      });
    }
    if (q.supplierId) and.push({ supplierId: q.supplierId });
    if (q.startDate) and.push({ purchaseDate: { gte: q.startDate } });
    if (q.endDate) and.push({ purchaseDate: { lte: q.endDate } });

    if (q.periodId) {
      const period = await this.prisma.inventoryPeriod.findUnique({
        where: { id: q.periodId },
      });
      if (period) {
        const start = monthStartUTC(period.year, period.month);
        const end = monthEndExclusiveUTC(period.year, period.month);
        and.push({ purchaseDate: { gte: start, lt: end } });
      }
    }

    const where: Prisma.PurchaseWhereInput = and.length ? { AND: and } : {};
    const includeItems = q.includeItems !== 'false';

    if (includeItems) {
      const [rows, total] = await Promise.all([
        this.prisma.purchase.findMany({
          where,
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
          include: PURCHASE_INCLUDE,
        }),
        this.prisma.purchase.count({ where }),
      ]);
      return { data: rows.map(serializePurchase), total, page: q.page, pageSize: q.pageSize };
    }

    // Lightweight list (no items) — Decimals still stringified.
    const [rows, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
        include: { supplier: { select: { id: true, name: true, contactName: true } } },
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return {
      data: rows.map((p) => ({
        ...p,
        subtotalHT: p.subtotalHT.toString(),
        tpsAmount: p.tpsAmount.toString(),
        tvqAmount: p.tvqAmount.toString(),
        totalAmount: p.totalAmount.toString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async findOne(id: string) {
    const p = await this.prisma.purchase.findUnique({
      where: { id },
      include: PURCHASE_INCLUDE,
    });
    if (!p) throw new NotFoundException('Achat introuvable');
    return serializePurchase(p);
  }

  /** Internal — raw record used by exports + period helpers. */
  async findOneRaw(id: string) {
    const p = await this.prisma.purchase.findUnique({
      where: { id },
      include: PURCHASE_INCLUDE,
    });
    if (!p) throw new NotFoundException('Achat introuvable');
    return p;
  }

  async summary(q: PurchaseSummaryQueryDto, user?: RequestUser) {
    const scope = resolveBranchScope(user, q.branchId);
    let month: number;
    let year: number;
    if (q.periodId) {
      const period = await this.prisma.inventoryPeriod.findUnique({ where: { id: q.periodId } });
      if (!period) throw new NotFoundException('Période introuvable');
      month = period.month;
      year = period.year;
    } else if (q.month && q.year) {
      month = q.month;
      year = q.year;
    } else {
      const now = new Date();
      month = now.getMonth() + 1;
      year = now.getFullYear();
    }

    const start = monthStartUTC(year, month);
    const end = monthEndExclusiveUTC(year, month);

    const baseWhere: Prisma.PurchaseWhereInput = {
      ...(scope ? { branchId: scope } : {}),
      purchaseDate: { gte: start, lt: end },
    };

    const [agg, perSupplier] = await Promise.all([
      this.prisma.purchase.aggregate({
        where: baseWhere,
        _sum: { totalAmount: true, subtotalHT: true, tpsAmount: true, tvqAmount: true },
        _count: { _all: true },
      }),
      this.prisma.purchase.groupBy({
        by: ['supplierId'],
        where: baseWhere,
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 1,
      }),
    ]);

    const totalAmount = agg._sum.totalAmount ?? new Prisma.Decimal(0);
    const count = agg._count._all;
    const avg = count > 0 ? totalAmount.div(count) : new Prisma.Decimal(0);

    let topSupplier: { id: string; name: string; totalAmount: string } | null = null;
    if (perSupplier.length > 0) {
      const top = perSupplier[0]!;
      const s = await this.prisma.supplier.findUnique({
        where: { id: top.supplierId },
        select: { id: true, name: true },
      });
      if (s) {
        topSupplier = {
          id: s.id,
          name: s.name,
          totalAmount: (top._sum.totalAmount ?? new Prisma.Decimal(0)).toString(),
        };
      }
    }

    return {
      month,
      year,
      totalAmount: totalAmount.toString(),
      subtotalHT: (agg._sum.subtotalHT ?? new Prisma.Decimal(0)).toString(),
      tpsAmount: (agg._sum.tpsAmount ?? new Prisma.Decimal(0)).toString(),
      tvqAmount: (agg._sum.tvqAmount ?? new Prisma.Decimal(0)).toString(),
      purchasesCount: count,
      topSupplier,
      averageBasket: avg.toString(),
    };
  }

  // -------------------------------------------------------------------
  // Accounting sync
  // -------------------------------------------------------------------

  /**
   * Creates or refreshes the single `AccountingExpense` row that mirrors a
   * `Purchase`. One row per purchase regardless of how many items it has —
   * the row carries the header totals (subtotalHT / TPS / TVQ / totalTTC).
   *
   * Called inside the same transaction as the purchase create/update so the
   * books are always in sync.
   *
   * Idempotent: drop + recreate. No diff logic, no allocation per item.
   *
   * Double-counting safety:
   * Category is always `ACHATS_FOURNISSEURS`, which is explicitly EXCLUDED
   * from `FinancialReport` expense buckets. The financial report's food
   * cost comes from `InventoryReport.realCost` (= opening + purchases −
   * closing). So purchases are counted ONCE in the P&L via the inventory
   * pipeline, and the row written here is purely for the accountant's view
   * — never double-counted in the financial report.
   */
  private async syncAccountingExpensesForPurchase(
    tx: Prisma.TransactionClient,
    purchaseId: string,
  ): Promise<void> {
    const p = await tx.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { select: { id: true } },
      },
    });
    if (!p) return; // purchase was deleted in the same tx — nothing to sync

    // Idempotent — re-syncs always start from a clean slate.
    await tx.accountingExpense.deleteMany({ where: { purchaseId } });

    const itemCount = p.items.length;
    const description =
      `Achat fournisseur — ${p.supplier.name} — ${itemCount} ligne${itemCount > 1 ? 's' : ''}`.slice(
        0,
        500,
      );

    // Resolve the dynamic "Achats fournisseurs" category (seeded by the
    // migration; created if anyone manually deleted it). Same row reused
    // across all purchase syncs — single category for every invoice.
    const category = await this.accountingCategories.findOrCreate(
      'Achats fournisseurs',
      tx,
    );

    await tx.accountingExpense.create({
      data: {
        branchId: p.branchId,
        expenseDate: p.purchaseDate,
        transactionDate: null,
        supplierId: p.supplier.id,
        supplierName: null,
        // Legacy enum kept in sync with the dynamic category for backwards
        // compat — the new UI reads `accountingCategoryId` only.
        category: ExpenseCategory.ACHATS_FOURNISSEURS,
        accountingCategoryId: category.id,
        description,
        referenceNumber: null,
        paymentMethod: null,
        // Header totals — never per-item. The Accounting row carries the
        // invoice-level numbers directly from the Purchase.
        amountBeforeTax: p.subtotalHT,
        tpsAmount: p.tpsAmount,
        tvqAmount: p.tvqAmount,
        totalAmount: p.totalAmount,
        notes: p.note ?? null,
        sourceType: AccountingSourceType.PURCHASE,
        purchaseId: p.id,
        // PURCHASE rows are NEVER counted in the financial report's expense
        // bucket — food cost already comes from `InventoryReport.realCost`.
        // Even if the user manually toggles this to true on a PURCHASE row,
        // the report filter also excludes by sourceType (defense in depth).
        includeInFinancialReports: false,
      },
    });
  }

  /**
   * Après un create/update d'achat, on écrase `InventoryProduct.defaultCost`
   * avec le dernier `unitPrice` saisi — c'est ce prix qui sera pré-rempli
   * dans le prochain formulaire d'achat pour ce produit (règle métier
   * client : « le dernier prix payé devient le prix proposé par défaut »).
   *
   * IMPORTANT :
   *   - Le WAC (Weighted Average Cost) de l'inventaire n'est PAS touché —
   *     il continue d'être recalculé à chaque clôture à partir de tous les
   *     PurchaseItem du mois. C'est deux notions distinctes :
   *
   *       defaultCost  = dernier prix payé  → sert au FORMULAIRE d'achat
   *       WAC          = moyenne pondérée   → sert au COST RÉEL d'inventaire
   *
   *   - Si un achat contient plusieurs items pour le même produit (rare mais
   *     possible), le DERNIER de la liste gagne. C'est aligné avec la
   *     sémantique "dernier prix saisi".
   *
   *   - Skip les items sans productId ou avec unitPrice ≤ 0 (protection
   *     contre les erreurs de saisie qui écraseraient un bon défaut avec 0).
   *
   *   - Multi-succursale automatique : chaque productId est unique par
   *     branche (chaque `InventoryProduct` a son propre uuid), donc
   *     l'update ne touche que la fiche produit de la branche de l'achat.
   */
  private async syncProductDefaultCostsFromPurchase(
    tx: Prisma.TransactionClient,
    items: Array<{ productId: string; unitPrice: number | Prisma.Decimal }>,
  ): Promise<void> {
    // Compact par productId, dernier prix gagne (dernier index de la liste).
    const lastPriceByProduct = new Map<string, Prisma.Decimal>();
    for (const it of items) {
      if (!it.productId) continue;
      const price =
        it.unitPrice instanceof Prisma.Decimal
          ? it.unitPrice
          : new Prisma.Decimal(it.unitPrice);
      if (price.lte(0)) continue;
      lastPriceByProduct.set(it.productId, price);
    }
    if (lastPriceByProduct.size === 0) return;

    // Prisma pipeline les updates sur la même connexion tx → une seule
    // aller-retour même avec 20+ produits.
    await Promise.all(
      [...lastPriceByProduct.entries()].map(([productId, defaultCost]) =>
        tx.inventoryProduct.update({
          where: { id: productId },
          data: { defaultCost },
        }),
      ),
    );
  }

  // -------------------------------------------------------------------
  // Frais supplémentaires (essence / livraison / etc.)
  //
  // Règles inviolables :
  //   - Ne touchent JAMAIS PurchaseItem.unitPrice, Product.defaultCost, WAC.
  //   - Chaque frais est mirroré 1-to-1 vers AccountingExpense avec
  //     sourceType = PURCHASE_ADDITIONAL_COST (distinct du mirror principal
  //     PURCHASE qui reste exclu du rapport financier).
  //   - includeInFinancialReports = true → apparaissent dans le rapport en HT.
  //   - Sur update : approche drop & recreate, la façon la plus safe de
  //     rester idempotent. La FK Cascade sur `purchaseAdditionalCostId`
  //     nettoie automatiquement les AccountingExpense associées.
  // -------------------------------------------------------------------

  /** Vérifie que chaque catégorie comptable référencée existe. Sinon 400
   *  clair au lieu d'un P2003 Prisma opaque. */
  private async assertAccountingCategoriesExist(categoryIds: string[]) {
    if (categoryIds.length === 0) return;
    const unique = Array.from(new Set(categoryIds));
    const found = await this.prisma.accountingCategory.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException(
        'Une ou plusieurs catégories comptables sont introuvables.',
      );
    }
  }

  /**
   * Approche drop & recreate — supprime tous les frais actuels de la
   * Purchase puis réinsère la liste soumise. La FK
   * `AccountingExpense.purchaseAdditionalCostId` est en Cascade → les
   * mirrors comptables sont nettoyés automatiquement. On recrée ensuite
   * les mirrors via `syncAccountingForAdditionalCosts`.
   *
   * Idempotent, robuste, aligne l'état final avec la liste soumise.
   */
  private async syncAdditionalCosts(
    tx: Prisma.TransactionClient,
    purchase: { id: string; branchId: string; purchaseDate: Date; supplier: { name: string } },
    inputs: Array<{
      costType: string;
      description?: string;
      accountingCategoryId: string;
      amountBeforeTax: number;
      tpsAmount: number;
      tvqAmount: number;
    }>,
  ): Promise<void> {
    // 1. Drop l'existant. Cascade FK nettoie les AccountingExpense mirror.
    await tx.purchaseAdditionalCost.deleteMany({
      where: { purchaseId: purchase.id },
    });

    if (inputs.length === 0) return;

    // 2. Insérer les nouveaux frais et récupérer leurs ids pour le mirror.
    for (const input of inputs) {
      const total = roundToCents(
        input.amountBeforeTax + input.tpsAmount + input.tvqAmount,
      );
      const created = await tx.purchaseAdditionalCost.create({
        data: {
          purchaseId: purchase.id,
          branchId: purchase.branchId,
          costType: input.costType,
          description: input.description ?? null,
          accountingCategoryId: input.accountingCategoryId,
          amountBeforeTax: new Prisma.Decimal(input.amountBeforeTax),
          tpsAmount: new Prisma.Decimal(input.tpsAmount),
          tvqAmount: new Prisma.Decimal(input.tvqAmount),
          totalAmount: new Prisma.Decimal(total),
        },
      });

      // 3. Mirror comptable 1-to-1. sourceType distinct du PURCHASE
      // principal → INCLUS dans le rapport financier (le filtre exclut
      // uniquement `sourceType=PURCHASE`).
      const label = friendlyCostLabel(input.costType);
      await tx.accountingExpense.create({
        data: {
          branchId: purchase.branchId,
          expenseDate: purchase.purchaseDate,
          transactionDate: null,
          supplierId: null,
          supplierName: null,
          // Legacy enum : on aligne sur ACHATS_FOURNISSEURS pour
          // rétrocompat des vieilles requêtes qui filtrent encore là-dessus,
          // mais la vraie catégorie utilisateur est `accountingCategoryId`.
          category: ExpenseCategory.ACHATS_FOURNISSEURS,
          accountingCategoryId: input.accountingCategoryId,
          description: `${label} — ${purchase.supplier.name}`.slice(0, 500),
          referenceNumber: null,
          paymentMethod: null,
          amountBeforeTax: new Prisma.Decimal(input.amountBeforeTax),
          tpsAmount: new Prisma.Decimal(input.tpsAmount),
          tvqAmount: new Prisma.Decimal(input.tvqAmount),
          totalAmount: new Prisma.Decimal(total),
          notes: input.description ?? null,
          sourceType: AccountingSourceType.PURCHASE_ADDITIONAL_COST,
          // PAS `purchaseId` — sinon on entre en conflit avec le mirror
          // principal PURCHASE (unique). Le lien remonte via
          // purchaseAdditionalCostId → purchaseAdditionalCost.purchaseId.
          purchaseAdditionalCostId: created.id,
          includeInFinancialReports: true,
        },
      });
    }
  }

  // -------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------

  async create(dto: CreatePurchaseDto, user?: RequestUser) {
    const branchId = resolveBranchForMutation(user, dto.branchId);
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw new BadRequestException('Fournisseur introuvable');

    // CREATE : un nouvel achat n'accepte que des produits actifs (guard opérationnel).
    await this.assertProductsBelongToBranch(
      branchId,
      dto.items.map((i) => i.productId),
      { requireActive: true },
    );
    await this.assertPeriodEditable(branchId, dto.purchaseDate, user);
    // Frais supplémentaires : valider les catégories comptables en amont.
    if (dto.additionalCosts && dto.additionalCosts.length > 0) {
      await this.assertAccountingCategoriesExist(
        dto.additionalCosts.map((c) => c.accountingCategoryId),
      );
    }

    const totals = this.computeTotals(dto.items, dto.tpsAmount, dto.tvqAmount);

    const row = await this.prisma.$transaction(async (tx) => {
      const items = dto.items.map((i, idx) => ({
        productId: i.productId,
        quantity: new Prisma.Decimal(i.quantity),
        unitPrice: new Prisma.Decimal(i.unitPrice),
        totalPrice: new Prisma.Decimal(totals.lineTotals[idx] ?? 0),
      }));

      const created = await tx.purchase.create({
        data: {
          branchId,
          supplierId: dto.supplierId,
          purchaseDate: dto.purchaseDate,
          note: dto.note ?? null,
          subtotalHT: new Prisma.Decimal(totals.subtotal),
          tpsAmount: new Prisma.Decimal(totals.tps),
          tvqAmount: new Prisma.Decimal(totals.tvq),
          totalAmount: new Prisma.Decimal(totals.total),
          items: { create: items },
        },
        include: PURCHASE_INCLUDE,
      });
      // Mirror each item as a PURCHASE_ITEM AccountingExpense row.
      await this.syncAccountingExpensesForPurchase(tx, created.id);
      // Écraser `Product.defaultCost` avec les prix saisis → prochain
      // formulaire proposera automatiquement le dernier prix.
      await this.syncProductDefaultCostsFromPurchase(tx, dto.items);
      // Frais supplémentaires (essence/livraison/...) — sync des lignes +
      // mirror comptable. Aucune interaction avec les items produits.
      if (dto.additionalCosts && dto.additionalCosts.length > 0) {
        await this.syncAdditionalCosts(
          tx,
          {
            id: created.id,
            branchId: created.branchId,
            purchaseDate: created.purchaseDate,
            supplier: { name: created.supplier.name },
          },
          dto.additionalCosts,
        );
      }
      // Re-lecture pour ramener les additionalCosts fraîchement écrits
      // dans le payload de retour.
      const finalRow = await tx.purchase.findUnique({
        where: { id: created.id },
        include: PURCHASE_INCLUDE,
      });
      return finalRow!;
    });
    return serializePurchase(row);
  }

  async update(id: string, dto: UpdatePurchaseDto, user?: RequestUser) {
    const existing = await this.findOneRaw(id);

    // Block edits in closed periods (both old and new date).
    await this.assertPeriodEditable(existing.branchId, existing.purchaseDate, user);
    if (dto.purchaseDate) {
      await this.assertPeriodEditable(existing.branchId, dto.purchaseDate, user);
    }

    if (dto.items) {
      const submittedIds = dto.items.map((i) => i.productId);
      // Toujours vérifier que les produits appartiennent bien à la branche.
      await this.assertProductsBelongToBranch(existing.branchId, submittedIds);
      // UPDATE : les productIds DÉJÀ présents sur l'achat historique restent
      // acceptés même si désactivés (contexte historique). Seuls les NOUVEAUX
      // productIds ajoutés à l'achat sont soumis à requireActive.
      const existingIds = new Set(existing.items.map((i) => i.productId));
      const newlyAddedIds = submittedIds.filter((id) => !existingIds.has(id));
      if (newlyAddedIds.length > 0) {
        await this.assertProductsBelongToBranch(existing.branchId, newlyAddedIds, {
          requireActive: true,
        });
      }
    }
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw new BadRequestException('Fournisseur introuvable');
    }
    // Frais supplémentaires : valider catégories comptables (bloc atomique
    // avec le reste — on refuse toute la mise à jour si une catégorie est
    // introuvable, pour éviter un état comptable partiellement cassé).
    if (dto.additionalCosts && dto.additionalCosts.length > 0) {
      await this.assertAccountingCategoriesExist(
        dto.additionalCosts.map((c) => c.accountingCategoryId),
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const headerData: Prisma.PurchaseUpdateInput = {
        ...(dto.supplierId && { supplier: { connect: { id: dto.supplierId } } }),
        ...(dto.purchaseDate && { purchaseDate: dto.purchaseDate }),
        ...(dto.note !== undefined && { note: dto.note }),
      };

      // If items, tps, or tvq changed → recompute totals from the merged view.
      // Otherwise, header-only update.
      const itemsChanged = !!dto.items;
      const tpsChanged = dto.tpsAmount !== undefined;
      const tvqChanged = dto.tvqAmount !== undefined;

      if (itemsChanged || tpsChanged || tvqChanged) {
        const items = dto.items ?? existing.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity.toNumber(),
          unitPrice: i.unitPrice.toNumber(),
        }));
        const tpsInput = tpsChanged ? dto.tpsAmount! : existing.tpsAmount.toNumber();
        const tvqInput = tvqChanged ? dto.tvqAmount! : existing.tvqAmount.toNumber();
        const totals = this.computeTotals(items, tpsInput, tvqInput);

        const data: Prisma.PurchaseUpdateInput = {
          ...headerData,
          subtotalHT: new Prisma.Decimal(totals.subtotal),
          tpsAmount: new Prisma.Decimal(totals.tps),
          tvqAmount: new Prisma.Decimal(totals.tvq),
          totalAmount: new Prisma.Decimal(totals.total),
        };

        if (itemsChanged) {
          await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
          data.items = {
            create: items.map((i, idx) => ({
              productId: i.productId,
              quantity: new Prisma.Decimal(i.quantity),
              unitPrice: new Prisma.Decimal(i.unitPrice),
              totalPrice: new Prisma.Decimal(totals.lineTotals[idx] ?? 0),
            })),
          };
        }

        const updated = await tx.purchase.update({ where: { id }, data, include: PURCHASE_INCLUDE });
        await this.syncAccountingExpensesForPurchase(tx, id);
        // Si les items ont changé (ou juste les taxes qui ont forcé une
        // recompute), on re-synchronise defaultCost avec les prix courants.
        // On utilise `items` (soit dto.items, soit les existants) qui est
        // en scope depuis la branche `itemsChanged || tpsChanged || tvqChanged`.
        if (itemsChanged) {
          await this.syncProductDefaultCostsFromPurchase(tx, items);
        }
        // Frais supplémentaires — sync UNIQUEMENT si le dto en fournit
        // explicitement (undefined = « ne touche pas », [] = « efface tout »).
        if (dto.additionalCosts !== undefined) {
          await this.syncAdditionalCosts(
            tx,
            {
              id: updated.id,
              branchId: updated.branchId,
              purchaseDate: updated.purchaseDate,
              supplier: { name: updated.supplier.name },
            },
            dto.additionalCosts,
          );
        }
        return updated;
      }

      const updated = await tx.purchase.update({
        where: { id },
        data: headerData,
        include: PURCHASE_INCLUDE,
      });
      // Header-only change (supplier / date / note) — re-sync so the linked
      // accounting rows pick up the new supplierId / expenseDate.
      await this.syncAccountingExpensesForPurchase(tx, id);
      // Frais supplémentaires — même règle : sync seulement si fourni.
      if (dto.additionalCosts !== undefined) {
        await this.syncAdditionalCosts(
          tx,
          {
            id: updated.id,
            branchId: updated.branchId,
            purchaseDate: updated.purchaseDate,
            supplier: { name: updated.supplier.name },
          },
          dto.additionalCosts,
        );
      }
      return updated;
    });
    // Re-lecture pour ramener additionalCosts frais dans le payload
    const finalRow = await this.prisma.purchase.findUnique({
      where: { id: row.id },
      include: PURCHASE_INCLUDE,
    });
    return serializePurchase(finalRow!);
  }

  /**
   * Hard-delete. The "validated / cancelled" status was removed at the
   * client's request — there is no soft cancel anymore. To remove an
   * erroneous purchase, hard-delete it; PurchaseItem cascade clears the
   * lines automatically. PurchaseAdditionalCost cascade nettoie aussi les
   * mirrors AccountingExpense associés.
   */
  async remove(id: string, user?: RequestUser): Promise<{ success: true }> {
    const existing = await this.findOneRaw(id);
    await this.assertPeriodEditable(existing.branchId, existing.purchaseDate, user);
    await this.prisma.purchase.delete({ where: { id } });
    return { success: true };
  }
}

// ---------------------------------------------------------------------
// Helpers standalone — évitent les cycles d'import et gardent la couche
// service focalisée sur la logique métier.
// ---------------------------------------------------------------------

/** Arrondi au cent (2 décimales) via Math.round pour éviter les
 *  artefacts flottants (ex : 0.1 + 0.2). Utilisé uniquement pour recomposer
 *  totalAmount = HT + TPS + TVQ côté service. */
function roundToCents(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** Libellé humain d'un preset code — utilisé dans la description de la
 *  ligne comptable mirror (ex : « Essence — Fournisseur X »). Fallback :
 *  on renvoie le code brut si non reconnu (extensible sans migration). */
function friendlyCostLabel(code: string): string {
  switch (code.toUpperCase()) {
    case 'ESSENCE':
      return 'Essence';
    case 'LIVRAISON':
      return 'Livraison';
    case 'PEAGE':
      return 'Péage';
    case 'TRANSPORT':
      return 'Transport';
    case 'MANUTENTION':
      return 'Manutention';
    case 'CHAINE_DU_FROID':
      return 'Chaîne du froid';
    case 'DOUANE':
      return 'Douane';
    case 'AUTRE':
      return 'Frais divers';
    default:
      return code;
  }
}
