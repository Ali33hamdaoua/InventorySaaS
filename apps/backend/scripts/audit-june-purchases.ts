/**
 * Audit COMPLET des achats de Juin 2026, comparaison croisée :
 *   - Page Achats (Purchase.subtotalHT + Purchase.totalAmount)
 *   - Somme des PurchaseItem.totalPrice (source de vérité inventaire)
 *   - InventoryReport.purchasesValue (stocké à la clôture)
 *   - Somme des InventoryLine.purchasesValue (stocké sur chaque ligne)
 *   - Re-agrégation live (ce que la close() calculerait maintenant)
 *
 * Objectif : identifier tout écart et savoir d'où il vient.
 *
 *   pnpm --filter @inventorymdb/backend exec ts-node scripts/audit-june-purchases.ts
 *
 * Read-only. Aucune écriture DB.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MONTH = 6;
const YEAR = 2026;

const fmt = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
});

function monthStartUTC(y: number, m: number) {
  return new Date(Date.UTC(y, m - 1, 1));
}
function monthEndExclusiveUTC(y: number, m: number) {
  return new Date(Date.UTC(y, m, 1));
}

function pad(s: string, n: number, right = false) {
  if (s.length >= n) return s.slice(0, n);
  const p = ' '.repeat(n - s.length);
  return right ? p + s : s + p;
}

/**
 * Réplique EXACTEMENT la logique d'agrégation de la close() :
 *   1. Charge tous les PurchaseItem du mois SANS filtre branche
 *   2. Regroupe par productId (Map)
 *   3. Boucle sur les InventoryLine du periodId
 *   4. Pour chaque ligne, additionne la valeur trouvée dans la Map
 *
 * Cette méthode reflète ce que close() écrirait AUJOURD'HUI si on
 * relançait une clôture — permet de comparer avec ce qui est stocké
 * (InventoryReport.purchasesValue) et détecter un drift.
 */
async function replayCloseAggregation(
  periodId: string,
  branchId: string,
  monthStart: Date,
  monthEndExcl: Date,
) {
  const purchaseItems = await prisma.purchaseItem.findMany({
    where: {
      purchase: {
        purchaseDate: { gte: monthStart, lt: monthEndExcl },
      },
    },
    include: {
      purchase: { select: { branchId: true, id: true } },
    },
  });

  const purchasesByProduct = new Map<string, { qty: number; value: number }>();
  const skippedOtherBranch: typeof purchaseItems = [];
  for (const it of purchaseItems) {
    // Note : la close() ACTUELLE ne filtre PAS par branche dans le findMany,
    // mais comme les lignes du periodId sont branch-scopées via leurs
    // productIds, seuls les items correspondants sont additionnés. On
    // reproduit ça fidèlement ici — mais on garde une trace du bruit.
    if (it.purchase.branchId !== branchId) {
      skippedOtherBranch.push(it);
      // continue quand même à peupler la map — la close() aussi, elle
      // n'utilisera juste jamais ces entrées.
    }
    const cur = purchasesByProduct.get(it.productId) ?? { qty: 0, value: 0 };
    cur.qty += Number(it.quantity);
    cur.value += Number(it.totalPrice);
    purchasesByProduct.set(it.productId, cur);
  }

  const lines = await prisma.inventoryLine.findMany({
    where: { periodId },
    select: { productId: true },
  });

  let attributed = 0;
  const attributedByProduct = new Map<string, number>();
  for (const l of lines) {
    const p = purchasesByProduct.get(l.productId);
    if (p) {
      attributed += p.value;
      attributedByProduct.set(l.productId, p.value);
    }
  }

  return {
    totalItemsInMonth: purchaseItems.length,
    totalItemValueInMonth: purchaseItems.reduce(
      (s, it) => s + Number(it.totalPrice),
      0,
    ),
    itemsSameBranch: purchaseItems.length - skippedOtherBranch.length,
    valueSameBranch: purchaseItems
      .filter((it) => it.purchase.branchId === branchId)
      .reduce((s, it) => s + Number(it.totalPrice), 0),
    replayedPurchasesValue: attributed,
    linesCount: lines.length,
    attributedByProduct,
  };
}

async function auditBranch(branchName: string) {
  const branch = await prisma.branch.findFirst({
    where: { name: { equals: branchName, mode: 'insensitive' } },
  });
  if (!branch) {
    console.log(`\n❌ Branche "${branchName}" introuvable.\n`);
    return;
  }

  const start = monthStartUTC(YEAR, MONTH);
  const end = monthEndExclusiveUTC(YEAR, MONTH);

  console.log('\n' + '='.repeat(90));
  console.log(`  🏪  ${branch.name.toUpperCase()} — Juin ${YEAR}`);
  console.log('='.repeat(90));

  // --------------------------------------------------------------------
  // 1. Page Achats — Purchase.subtotalHT + totalAmount
  // --------------------------------------------------------------------
  const purchases = await prisma.purchase.findMany({
    where: {
      branchId: branch.id,
      purchaseDate: { gte: start, lt: end },
    },
    include: {
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          totalPrice: true,
        },
      },
    },
  });

  const sumHT = purchases.reduce((s, p) => s + Number(p.subtotalHT), 0);
  const sumTTC = purchases.reduce((s, p) => s + Number(p.totalAmount), 0);
  const sumItemsPurchase = purchases.reduce(
    (s, p) => s + p.items.reduce((s2, i) => s2 + Number(i.totalPrice), 0),
    0,
  );

  console.log('\n📄 Page Achats — Purchase du mois');
  console.log(`   ${purchases.length} factures d'achat`);
  console.log(`   Σ subtotalHT (avant taxes)   : ${fmt.format(sumHT).padStart(12)}`);
  console.log(`   Σ totalAmount (TTC)          : ${fmt.format(sumTTC).padStart(12)}`);
  console.log(`   Σ PurchaseItem.totalPrice    : ${fmt.format(sumItemsPurchase).padStart(12)}`);
  const checkHtVsItems = Math.abs(sumHT - sumItemsPurchase);
  console.log(
    `   Sanity check subtotalHT == Σ items : ${
      checkHtVsItems < 0.5 ? '✅' : `⚠ écart ${fmt.format(checkHtVsItems)}`
    }`,
  );

  // --------------------------------------------------------------------
  // 2. Période d'inventaire de juin
  // --------------------------------------------------------------------
  const period = await prisma.inventoryPeriod.findUnique({
    where: {
      branchId_year_month: { branchId: branch.id, year: YEAR, month: MONTH },
    },
    include: {
      report: {
        select: {
          openingValue: true,
          purchasesValue: true,
          closingValue: true,
          realCost: true,
          foodCost: true,
          paperCost: true,
          cleaningCost: true,
          generatedAt: true,
        },
      },
    },
  });

  console.log('\n📦 Période d\'inventaire de Juin');
  if (!period) {
    console.log('   ❌ Aucune période inventaire pour ce mois');
    return;
  }
  console.log(`   Statut : ${period.status}`);
  console.log(`   ${period.report ? 'InventoryReport présent' : '⚠ Pas d\'InventoryReport (période non clôturée)'}`);

  if (period.report) {
    console.log(`   InventoryReport.openingValue     : ${fmt.format(Number(period.report.openingValue)).padStart(12)}`);
    console.log(`   InventoryReport.purchasesValue   : ${fmt.format(Number(period.report.purchasesValue)).padStart(12)}  ← MONTANT ACHATS RAPPORTÉ`);
    console.log(`   InventoryReport.closingValue     : ${fmt.format(Number(period.report.closingValue)).padStart(12)}`);
    console.log(`   InventoryReport.realCost         : ${fmt.format(Number(period.report.realCost)).padStart(12)}`);
    console.log(`   Ventilation :`);
    console.log(`     food     : ${fmt.format(Number(period.report.foodCost)).padStart(12)}`);
    console.log(`     paper    : ${fmt.format(Number(period.report.paperCost)).padStart(12)}`);
    console.log(`     cleaning : ${fmt.format(Number(period.report.cleaningCost)).padStart(12)}`);
    console.log(`   generatedAt : ${period.report.generatedAt.toISOString()}`);
  }

  // --------------------------------------------------------------------
  // 3. Somme des InventoryLine.purchasesValue (per-ligne)
  // --------------------------------------------------------------------
  const linesAgg = await prisma.inventoryLine.aggregate({
    where: { periodId: period.id },
    _sum: { purchasesValue: true },
  });
  const linesSum = Number(linesAgg._sum.purchasesValue ?? 0);
  console.log(`   Σ InventoryLine.purchasesValue   : ${fmt.format(linesSum).padStart(12)}`);
  const lineVsReport = Math.abs(
    Number(period.report?.purchasesValue ?? 0) - linesSum,
  );
  console.log(
    `   Sanity report vs lines           : ${
      lineVsReport < 0.5 ? '✅' : `⚠ écart ${fmt.format(lineVsReport)}`
    }`,
  );

  // --------------------------------------------------------------------
  // 4. Re-jeu de l'agrégation live (ce que close() ferait maintenant)
  // --------------------------------------------------------------------
  const replay = await replayCloseAggregation(period.id, branch.id, start, end);
  console.log(`\n🔁 Re-jeu logique close() (agrégation live)`);
  console.log(`   PurchaseItems du mois (toutes branches confondues) : ${replay.totalItemsInMonth} lignes  ${fmt.format(replay.totalItemValueInMonth)}`);
  console.log(`   dont même branche (${branch.name})                      : ${replay.itemsSameBranch} lignes  ${fmt.format(replay.valueSameBranch)}`);
  console.log(`   InventoryLine du periodId : ${replay.linesCount} lignes`);
  console.log(`   Σ valeur attribuée aux InventoryLine : ${fmt.format(replay.replayedPurchasesValue).padStart(12)}  ← REPLAY`);

  // --------------------------------------------------------------------
  // 5. Écart Page Achats vs Inventaire
  // --------------------------------------------------------------------
  const reportedInv = Number(period.report?.purchasesValue ?? 0);
  const gap = reportedInv - sumHT;
  console.log(`\n🎯 Comparaison Achats vs Inventaire\n`);
  console.log(`   Achats — Σ subtotalHT (page Achats)           : ${fmt.format(sumHT).padStart(12)}`);
  console.log(`   Achats — Σ PurchaseItem.totalPrice            : ${fmt.format(sumItemsPurchase).padStart(12)}`);
  console.log(`   Inventaire — InventoryReport.purchasesValue    : ${fmt.format(reportedInv).padStart(12)}`);
  console.log(`   Inventaire — replay live                       : ${fmt.format(replay.replayedPurchasesValue).padStart(12)}`);
  if (Math.abs(gap) < 0.5) {
    console.log(`   ✅ Cohérent — Achats = Inventaire`);
  } else {
    console.log(`   ⚠ Écart Inventaire − Achats HT = ${fmt.format(gap)}`);
    if (gap < 0) {
      console.log(`     → Il MANQUE ${fmt.format(-gap)} dans l'inventaire`);
    } else {
      console.log(`     → L'inventaire compte ${fmt.format(gap)} EN TROP`);
    }
  }

  // --------------------------------------------------------------------
  // 6. Détection des PurchaseItem NON attribués à une InventoryLine
  //    (produits achetés mais pas présents dans l'inventaire de la période)
  // --------------------------------------------------------------------
  const orphans: {
    purchaseId: string;
    productId: string;
    productName: string;
    quantity: number;
    totalPrice: number;
    purchaseDate: string;
  }[] = [];

  const branchPurchaseItems = await prisma.purchaseItem.findMany({
    where: {
      purchase: {
        branchId: branch.id,
        purchaseDate: { gte: start, lt: end },
      },
    },
    include: {
      product: { select: { name: true, isActive: true, category: { select: { categoryType: true, name: true } } } },
      purchase: { select: { id: true, purchaseDate: true } },
    },
  });

  const attributedProductIds = new Set(replay.attributedByProduct.keys());
  for (const it of branchPurchaseItems) {
    if (!attributedProductIds.has(it.productId)) {
      orphans.push({
        purchaseId: it.purchase.id,
        productId: it.productId,
        productName: it.product.name,
        quantity: Number(it.quantity),
        totalPrice: Number(it.totalPrice),
        purchaseDate: it.purchase.purchaseDate.toISOString().slice(0, 10),
      });
    }
  }

  if (orphans.length > 0) {
    const orphanTotal = orphans.reduce((s, o) => s + o.totalPrice, 0);
    console.log(`\n🕳  PurchaseItems ORPHELINS (achats sans InventoryLine correspondante) :`);
    console.log(`   ${orphans.length} ligne(s) — Total ${fmt.format(orphanTotal)}`);
    for (const o of orphans) {
      console.log(
        `     • ${o.purchaseDate}  ${pad(o.productName, 30)} qty=${String(o.quantity).padStart(6)}  ${fmt.format(o.totalPrice).padStart(10)}`,
      );
    }
    console.log(
      `   → Ces ${fmt.format(orphanTotal)} sont dans les factures d'achat mais N'apparaissent PAS dans InventoryReport.purchasesValue.`,
    );
  } else {
    console.log(`\n✅ Aucun PurchaseItem orphelin (tous les achats trouvent leur ligne d'inventaire).`);
  }

  // --------------------------------------------------------------------
  // 7. Ventilation par CategoryType (Food/Paper/Cleaning)
  // --------------------------------------------------------------------
  const byType: Record<string, { count: number; value: number }> = {};
  const uncategorized: typeof branchPurchaseItems = [];
  for (const it of branchPurchaseItems) {
    const type = it.product.category?.categoryType ?? 'SANS_CATEGORIE';
    if (!it.product.category) uncategorized.push(it);
    const b = byType[type] ?? { count: 0, value: 0 };
    b.count += 1;
    b.value += Number(it.totalPrice);
    byType[type] = b;
  }
  console.log(`\n🏷  Ventilation des achats du mois par CategoryType`);
  for (const [t, b] of Object.entries(byType).sort((a, b) => b[1].value - a[1].value)) {
    const pct = sumItemsPurchase > 0 ? ((b.value / sumItemsPurchase) * 100).toFixed(1) : '—';
    console.log(`   ${pad(t, 18)} ${String(b.count).padStart(4)} items  ${fmt.format(b.value).padStart(12)}  (${pct} %)`);
  }
  if (uncategorized.length > 0) {
    console.log(`   ⚠ ${uncategorized.length} item(s) sans catégorie du tout (tomberont dans PAPER par fallback)`);
  }

  // --------------------------------------------------------------------
  // 8. Vérification double-comptage compta
  // --------------------------------------------------------------------
  const accountingPurchases = await prisma.accountingExpense.findMany({
    where: {
      branchId: branch.id,
      expenseDate: { gte: start, lt: end },
      deletedAt: null,
      sourceType: 'PURCHASE',
    },
    select: {
      id: true,
      purchaseId: true,
      totalAmount: true,
      includeInFinancialReports: true,
    },
  });
  const purchaseAccountingSum = accountingPurchases.reduce(
    (s, e) => s + Number(e.totalAmount),
    0,
  );
  const purchaseAccountingIncluded = accountingPurchases.filter(
    (e) => e.includeInFinancialReports,
  ).length;
  console.log(`\n📚 Miroir compta des achats (sourceType=PURCHASE)`);
  console.log(`   ${accountingPurchases.length} lignes AccountingExpense mirror`);
  console.log(`   Σ totalAmount (TTC)                 : ${fmt.format(purchaseAccountingSum).padStart(12)}`);
  console.log(`   dont includeInFinancialReports=true : ${purchaseAccountingIncluded} lignes`);
  console.log(`   (le rapport financier EXCLUT toutes les lignes PURCHASE via filtre sourceType, donc pas de double comptage)`);
}

async function main() {
  for (const b of ['Joliette', 'Bishop']) {
    await auditBranch(b);
  }

  console.log('\n' + '='.repeat(90));
  console.log('  📝 Récapitulatif de la règle métier');
  console.log('='.repeat(90));
  console.log(`
  Deux "totaux d'achat" existent, mesurant deux choses différentes :

    A. Page Achats — Purchase.totalAmount (TTC, avec taxes)
       = ce que tu paies vraiment au fournisseur

    B. Inventaire — InventoryReport.purchasesValue (HT)
       = ce qui entre dans ton stock pour le calcul du food cost
       = Σ PurchaseItem.totalPrice pour les produits QUI ONT une ligne dans le
         périodInventaire correspondant

  Un PurchaseItem N'entre dans (B) que si son productId est dans les
  InventoryLine du periodId. Si un produit est acheté mais n'a pas
  d'InventoryLine (ex. produit désactivé, ou nouveau produit ajouté après
  bootstrap), son achat est INVISIBLE de l'inventaire.

  ⚠ Attention aux taxes : (A) inclut TPS+TVQ, (B) ne les inclut PAS.
    Un écart d'environ 15 % entre (A) et (B) = attendu (= taxes canadiennes).
    Un écart plus important = signal d'orphelins ou de désynchro.

  DOUBLE COMPTAGE :
    Chaque Purchase crée une AccountingExpense mirror avec sourceType=PURCHASE
    et includeInFinancialReports=false. Le rapport financier EXCLUT
    explicitement ces lignes (sourceType filter + includeInFinancialReports).
    → Aucun risque de double comptage.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
