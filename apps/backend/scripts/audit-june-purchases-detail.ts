/**
 * Audit DÉTAILLÉ des achats de Juin 2026 — Bishop + Joliette.
 * Liste ligne-par-ligne chaque Purchase et chaque PurchaseItem,
 * cross-référence avec les InventoryLine du period Juin de la branche,
 * et flag toute anomalie.
 *
 * pnpm --filter @inventorymdb/backend exec ts-node scripts/audit-june-purchases-detail.ts
 *
 * Read-only.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MONTH = 6;
const YEAR = 2026;

const fmt = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
});

function pad(s: string, n: number, right = false) {
  const str = String(s);
  if (str.length >= n) return str.slice(0, n);
  const p = ' '.repeat(n - str.length);
  return right ? p + str : str + p;
}
function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function auditBranchDetail(branchName: string) {
  const branch = await prisma.branch.findFirst({
    where: { name: { equals: branchName, mode: 'insensitive' } },
  });
  if (!branch) return;

  const start = new Date(Date.UTC(YEAR, MONTH - 1, 1));
  const end = new Date(Date.UTC(YEAR, MONTH, 1));

  console.log('\n' + '█'.repeat(110));
  console.log(`  🏪  ${branch.name.toUpperCase()} — Détail des achats de Juin ${YEAR}`);
  console.log('█'.repeat(110));

  // ==========================================================================
  // 1. TOUTES les Purchase de la branche pour juin
  // ==========================================================================
  const purchases = await prisma.purchase.findMany({
    where: {
      branchId: branch.id,
      purchaseDate: { gte: start, lt: end },
    },
    include: {
      supplier: { select: { name: true } },
      items: {
        include: {
          product: {
            include: {
              category: { select: { name: true, categoryType: true } },
            },
          },
        },
      },
      accountingExpenses: {
        select: { id: true, sourceType: true, totalAmount: true },
      },
    },
    orderBy: { purchaseDate: 'asc' },
  });

  console.log(`\n📄 LISTE DES ${purchases.length} PURCHASES DE JUIN\n`);
  console.log(
    pad('#', 3) + ' │ ' +
    pad('Date', 11) + ' │ ' +
    pad('Fournisseur', 26) + ' │ ' +
    pad('Items', 5, true) + ' │ ' +
    pad('subtotalHT', 12, true) + ' │ ' +
    pad('TPS', 8, true) + ' │ ' +
    pad('TVQ', 8, true) + ' │ ' +
    pad('Total TTC', 12, true) + ' │ ' +
    pad('Mirror', 8),
  );
  console.log('─'.repeat(110));

  let totalHT = 0;
  let totalTTC = 0;
  let totalTPS = 0;
  let totalTVQ = 0;
  let itemsSum = 0;

  purchases.forEach((p, i) => {
    const ht = Number(p.subtotalHT);
    const tps = Number(p.tpsAmount);
    const tvq = Number(p.tvqAmount);
    const ttc = Number(p.totalAmount);
    const itemsTotal = p.items.reduce((s, it) => s + Number(it.totalPrice), 0);
    totalHT += ht;
    totalTTC += ttc;
    totalTPS += tps;
    totalTVQ += tvq;
    itemsSum += itemsTotal;
    const mirror = p.accountingExpenses.length > 0 ? '✅' : '❌ MANQUANT';
    console.log(
      pad(String(i + 1), 3) + ' │ ' +
      pad(fmtDate(p.purchaseDate), 11) + ' │ ' +
      pad(p.supplier?.name ?? '—', 26) + ' │ ' +
      pad(String(p.items.length), 5, true) + ' │ ' +
      pad(fmt.format(ht), 12, true) + ' │ ' +
      pad(fmt.format(tps), 8, true) + ' │ ' +
      pad(fmt.format(tvq), 8, true) + ' │ ' +
      pad(fmt.format(ttc), 12, true) + ' │ ' +
      pad(mirror, 8),
    );
  });
  console.log('─'.repeat(110));
  console.log(
    pad('', 3) + ' │ ' + pad('', 11) + ' │ ' + pad('TOTAUX', 26) + ' │ ' +
    pad(String(purchases.reduce((s, p) => s + p.items.length, 0)), 5, true) + ' │ ' +
    pad(fmt.format(totalHT), 12, true) + ' │ ' +
    pad(fmt.format(totalTPS), 8, true) + ' │ ' +
    pad(fmt.format(totalTVQ), 8, true) + ' │ ' +
    pad(fmt.format(totalTTC), 12, true),
  );
  console.log(`   Sanity Σ items = ${fmt.format(itemsSum)} ${Math.abs(itemsSum - totalHT) < 0.5 ? '✅' : '⚠'}`);

  // ==========================================================================
  // 2. Récupérer la période d'inventaire de juin + toutes ses InventoryLine
  // ==========================================================================
  const period = await prisma.inventoryPeriod.findUnique({
    where: {
      branchId_year_month: { branchId: branch.id, year: YEAR, month: MONTH },
    },
    include: {
      report: true,
      lines: {
        select: {
          id: true,
          productId: true,
          purchasesQuantity: true,
          purchasesValue: true,
          product: {
            select: {
              name: true,
              isActive: true,
              category: { select: { name: true, categoryType: true } },
            },
          },
        },
      },
    },
  });

  if (!period) {
    console.log('\n❌ Pas de période inventaire pour juin.\n');
    return;
  }

  const inventoryLineProductIds = new Set(period.lines.map((l) => l.productId));
  console.log(`\n📦 InventoryPeriod Juin — ${period.status}, ${period.lines.length} InventoryLine`);
  console.log(`   Report.purchasesValue = ${fmt.format(Number(period.report?.purchasesValue ?? 0))}`);
  console.log(`   Report.openingValue  = ${fmt.format(Number(period.report?.openingValue ?? 0))}`);
  console.log(`   Report.closingValue  = ${fmt.format(Number(period.report?.closingValue ?? 0))}`);
  console.log(`   Report.realCost      = ${fmt.format(Number(period.report?.realCost ?? 0))}`);

  // ==========================================================================
  // 3. Inspecter CHAQUE PurchaseItem — matché ou non à une InventoryLine ?
  // ==========================================================================
  console.log(`\n🔍 DÉTAIL PurchaseItem ─ matching contre les InventoryLine du periodId Bishop\n`);

  const allItems = purchases.flatMap((p) =>
    p.items.map((it) => ({
      purchaseId: p.id,
      purchaseDate: fmtDate(p.purchaseDate),
      supplier: p.supplier?.name ?? '—',
      productId: it.productId,
      productName: it.product.name,
      productIsActive: it.product.isActive,
      categoryName: it.product.category?.name ?? '—',
      categoryType: it.product.category?.categoryType ?? 'SANS_CATEGORIE',
      quantity: Number(it.quantity),
      totalPrice: Number(it.totalPrice),
      inLine: inventoryLineProductIds.has(it.productId),
    })),
  );

  // Aggregation par produit
  const byProduct = new Map<
    string,
    {
      name: string;
      isActive: boolean;
      categoryName: string;
      categoryType: string;
      count: number;
      totalPrice: number;
      inLine: boolean;
    }
  >();
  for (const it of allItems) {
    const existing = byProduct.get(it.productId);
    if (existing) {
      existing.count += 1;
      existing.totalPrice += it.totalPrice;
    } else {
      byProduct.set(it.productId, {
        name: it.productName,
        isActive: it.productIsActive,
        categoryName: it.categoryName,
        categoryType: it.categoryType,
        count: 1,
        totalPrice: it.totalPrice,
        inLine: it.inLine,
      });
    }
  }

  const sortedProducts = [...byProduct.entries()].sort(
    (a, b) => b[1].totalPrice - a[1].totalPrice,
  );

  console.log(
    pad('Produit', 32) + ' │ ' +
    pad('Cat.', 12) + ' │ ' +
    pad('Type', 14) + ' │ ' +
    pad('Actif', 5) + ' │ ' +
    pad('#', 3, true) + ' │ ' +
    pad('Total HT', 11, true) + ' │ ' +
    'InvLine',
  );
  console.log('─'.repeat(105));

  let matchedValue = 0;
  let unmatchedValue = 0;
  const unmatchedProducts: {
    productId: string;
    name: string;
    isActive: boolean;
    totalPrice: number;
  }[] = [];

  for (const [productId, p] of sortedProducts) {
    if (p.inLine) matchedValue += p.totalPrice;
    else {
      unmatchedValue += p.totalPrice;
      unmatchedProducts.push({
        productId,
        name: p.name,
        isActive: p.isActive,
        totalPrice: p.totalPrice,
      });
    }
    console.log(
      pad(p.name, 32) + ' │ ' +
      pad(p.categoryName, 12) + ' │ ' +
      pad(p.categoryType, 14) + ' │ ' +
      pad(p.isActive ? 'oui' : 'NON', 5) + ' │ ' +
      pad(String(p.count), 3, true) + ' │ ' +
      pad(fmt.format(p.totalPrice), 11, true) + ' │ ' +
      (p.inLine ? '✅' : '❌ ORPHELIN'),
    );
  }
  console.log('─'.repeat(105));
  console.log(`   Σ matché (rejoint l'inventaire)   : ${fmt.format(matchedValue).padStart(12)}`);
  console.log(`   Σ orphelin (pas dans l'inventaire) : ${fmt.format(unmatchedValue).padStart(12)}`);
  console.log(`   Σ total items HT                    : ${fmt.format(matchedValue + unmatchedValue).padStart(12)}`);
  console.log(`   Cross-check vs Purchase.subtotalHT  : ${
    Math.abs(matchedValue + unmatchedValue - totalHT) < 0.5 ? '✅' : `⚠ écart ${fmt.format(Math.abs(matchedValue + unmatchedValue - totalHT))}`
  }`);

  // ==========================================================================
  // 4. Vérifier les produits qui ont une InventoryLine mais AUCUN achat en juin
  // ==========================================================================
  const purchasedProductIds = new Set(allItems.map((it) => it.productId));
  const linesWithoutPurchase = period.lines.filter(
    (l) => !purchasedProductIds.has(l.productId),
  );
  const linesWithPurchaseSum = period.lines
    .filter((l) => purchasedProductIds.has(l.productId))
    .reduce((s, l) => s + Number(l.purchasesValue), 0);
  console.log(`\n📋 InventoryLine du period :`);
  console.log(`   ${period.lines.length} lignes au total`);
  console.log(`   ${period.lines.length - linesWithoutPurchase.length} lignes ont eu au moins un achat en juin`);
  console.log(`   ${linesWithoutPurchase.length} lignes SANS achat ce mois-ci`);
  console.log(`   Σ purchasesValue des lignes achetées : ${fmt.format(linesWithPurchaseSum)} (devrait matcher Report.purchasesValue)`);

  // ==========================================================================
  // 5. Résumé Achats vs Inventaire
  // ==========================================================================
  const reportPurch = Number(period.report?.purchasesValue ?? 0);
  console.log(`\n🎯 SYNTHÈSE ${branch.name}`);
  console.log(`   Purchase.subtotalHT (HT)             : ${fmt.format(totalHT).padStart(12)}`);
  console.log(`   Purchase.totalAmount (TTC)           : ${fmt.format(totalTTC).padStart(12)}  ← ce que le KPI card affiche`);
  console.log(`     dont TPS                            : ${fmt.format(totalTPS).padStart(12)}`);
  console.log(`     dont TVQ                            : ${fmt.format(totalTVQ).padStart(12)}`);
  console.log(`   InventoryReport.purchasesValue (HT)   : ${fmt.format(reportPurch).padStart(12)}  ← ce que l'inventaire affiche`);
  console.log(`   Écart HT vs Report                    : ${fmt.format(Math.abs(totalHT - reportPurch)).padStart(12)}`);
  console.log(`   Écart TTC vs Report                   : ${fmt.format(Math.abs(totalTTC - reportPurch)).padStart(12)}  = TPS + TVQ`);
  console.log(`   Achats orphelins (pas dans invent.)   : ${fmt.format(unmatchedValue).padStart(12)}`);
  if (unmatchedProducts.length > 0) {
    console.log(`\n   ⚠ Produits ORPHELINS (achetés mais absents de l'inventaire de juin) :`);
    for (const u of unmatchedProducts) {
      console.log(`      • ${u.name.padEnd(32)}  actif=${u.isActive ? 'oui' : 'NON'}  ${fmt.format(u.totalPrice).padStart(10)}`);
    }
  }
}

async function main() {
  for (const b of ['Bishop', 'Joliette']) {
    await auditBranchDetail(b);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
