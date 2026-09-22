/**
 * One-shot audit : trace la provenance des « Dépenses totales » du
 * Rapport Financier de Juin 2026 pour Joliette et Bishop, et compare
 * avec le total « Dépenses comptables » brut du même mois.
 *
 *   pnpm --filter @inventorymdb/backend exec ts-node scripts/audit-june-total-expenses.ts
 *
 * Read-only. Reprend EXACTEMENT la logique du service financial-reports
 * pour que les chiffres soient identiques à ce que voit l'UI.
 */
import { AccountingSourceType, PrismaClient } from '@prisma/client';

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

async function auditBranch(branchName: string) {
  const branch = await prisma.branch.findFirst({
    where: { name: { equals: branchName, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (!branch) {
    console.log(`\n❌ Branche "${branchName}" introuvable.\n`);
    return;
  }

  const start = monthStartUTC(YEAR, MONTH);
  const end = monthEndExclusiveUTC(YEAR, MONTH);

  // ============================================================
  // 1. Provenance du "Dépenses totales" du Rapport Financier
  // ============================================================

  const report = await prisma.financialReport.findUnique({
    where: {
      branchId_year_month: { branchId: branch.id, year: YEAR, month: MONTH },
    },
  });

  const period = await prisma.inventoryPeriod.findUnique({
    where: {
      branchId_year_month: { branchId: branch.id, year: YEAR, month: MONTH },
    },
    include: {
      report: {
        select: {
          realCost: true,
          foodCost: true,
          paperCost: true,
          cleaningCost: true,
        },
      },
    },
  });

  // Réplique la logique EXACTE de financial-reports.service.ts::computeLive
  const foodCost = Number(period?.report?.foodCost ?? 0);
  const paperCost = Number(period?.report?.paperCost ?? 0);
  const cleaningCost = Number(period?.report?.cleaningCost ?? 0);
  const realCost = Number(period?.report?.realCost ?? 0);

  const laborAgg = await prisma.laborEntry.aggregate({
    where: {
      branchId: branch.id,
      date: { gte: start, lt: end },
    },
    _sum: { totalAmount: true },
  });
  const autoLaborCost = Number(laborAgg._sum.totalAmount ?? 0);
  const laborCost = autoLaborCost > 0 ? autoLaborCost : Number(report?.laborCost ?? 0);

  // Comptables INCLUS dans le rapport financier :
  //   - branchId match
  //   - période du mois (expenseDate dans [start, end[)
  //   - not deleted
  //   - includeInFinancialReports = true
  //   - sourceType != PURCHASE (déjà dans food cost via inventaire)
  //   - accountingCategoryId not null
  const includedExpenses = await prisma.accountingExpense.findMany({
    where: {
      branchId: branch.id,
      expenseDate: { gte: start, lt: end },
      deletedAt: null,
      includeInFinancialReports: true,
      sourceType: { not: AccountingSourceType.PURCHASE },
      accountingCategoryId: { not: null },
    },
    include: {
      accountingCategory: { select: { name: true } },
    },
    orderBy: [{ expenseDate: 'desc' }],
  });

  const categoryTotal = includedExpenses.reduce(
    (s, e) => s + Number(e.totalAmount),
    0,
  );

  // Le total = realCost + categoryTotal + laborCost (cf. computeLive ligne 342)
  const totalExpenses = realCost + categoryTotal + laborCost;

  // ============================================================
  // 2. TOUTES les dépenses comptables du mois (sans filtre inclusion)
  // ============================================================

  const allAccountingExpenses = await prisma.accountingExpense.findMany({
    where: {
      branchId: branch.id,
      expenseDate: { gte: start, lt: end },
      deletedAt: null,
    },
    include: {
      accountingCategory: { select: { name: true } },
    },
  });

  const allTotal = allAccountingExpenses.reduce(
    (s, e) => s + Number(e.totalAmount),
    0,
  );

  // Ventilation détaillée
  const bySource = new Map<string, { count: number; total: number }>();
  const excluded: typeof allAccountingExpenses = [];
  for (const e of allAccountingExpenses) {
    const key = e.sourceType;
    const b = bySource.get(key) ?? { count: 0, total: 0 };
    b.count += 1;
    b.total += Number(e.totalAmount);
    bySource.set(key, b);

    const shouldBeExcluded =
      !e.includeInFinancialReports ||
      e.sourceType === AccountingSourceType.PURCHASE ||
      !e.accountingCategoryId;
    if (shouldBeExcluded) excluded.push(e);
  }

  // ============================================================
  // Affichage
  // ============================================================

  console.log('\n' + '='.repeat(78));
  console.log(`  🏪  ${branch.name.toUpperCase()} — Juin ${YEAR}`);
  console.log('='.repeat(78));

  console.log('\n📊 Rapport Financier — décomposition du "Dépenses totales"\n');
  console.log(`  Food cost      (Inventaire)  : ${fmt.format(foodCost).padStart(14)}`);
  console.log(`  Paper cost     (Inventaire)  : ${fmt.format(paperCost).padStart(14)}`);
  console.log(`  Cleaning cost  (Inventaire)  : ${fmt.format(cleaningCost).padStart(14)}`);
  console.log(`  ──────────────────────────────────────────────`);
  console.log(`  Real cost      (sous-total)  : ${fmt.format(realCost).padStart(14)}`);
  console.log(`  Main-d'œuvre   (LaborEntry)  : ${fmt.format(laborCost).padStart(14)}  (${autoLaborCost > 0 ? 'auto module Labor' : 'fallback manuel'})`);

  if (includedExpenses.length > 0) {
    console.log(`  Dépenses comptables incluses (${includedExpenses.length} lignes) :`);
    const byCat = new Map<string, number>();
    for (const e of includedExpenses) {
      const cat = e.accountingCategory?.name ?? '—';
      byCat.set(cat, (byCat.get(cat) ?? 0) + Number(e.totalAmount));
    }
    for (const [cat, val] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`     • ${cat.padEnd(28)} ${fmt.format(val).padStart(12)}`);
    }
  } else {
    console.log(`  Dépenses comptables incluses : ${fmt.format(0).padStart(12)} (0 lignes)`);
  }
  console.log(`  ──────────────────────────────────────────────`);
  console.log(`  DÉPENSES TOTALES              : ${fmt.format(totalExpenses).padStart(14)}`);

  console.log('\n📚 Section Comptabilité — total brut du mois\n');
  console.log(`  Total (${allAccountingExpenses.length} lignes)         : ${fmt.format(allTotal).padStart(14)}`);
  console.log(`  Ventilation par source :`);
  for (const [src, b] of [...bySource.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`     • ${src.padEnd(10)} ${String(b.count).padStart(3)} lignes  ${fmt.format(b.total).padStart(12)}`);
  }

  // Le "Real Cost" du rapport financier ne vient PAS de la compta, mais de
  // l'inventaire. Donc pour comparer honnêtement les deux totaux, on doit
  // isoler la PART qui vient de la compta dans chaque camp.
  const rapportPartCompta = categoryTotal;
  const comptaPartIncluse = allAccountingExpenses
    .filter(
      (e) =>
        e.includeInFinancialReports &&
        e.sourceType !== AccountingSourceType.PURCHASE &&
        !!e.accountingCategoryId,
    )
    .reduce((s, e) => s + Number(e.totalAmount), 0);

  console.log('\n🔗 Comparaison directe (uniquement la partie « comptabilité »)\n');
  console.log(`  Rapport financier — Σ catégories comptables : ${fmt.format(rapportPartCompta).padStart(12)}`);
  console.log(`  Comptabilité      — Σ lignes remontées      : ${fmt.format(comptaPartIncluse).padStart(12)}`);
  const diff = Math.abs(rapportPartCompta - comptaPartIncluse);
  console.log(`  ${diff < 0.01 ? '✅ Cohérent' : `⚠ Écart ${fmt.format(diff)}`}`);

  console.log('\n🚫 Dépenses EXCLUES du rapport financier (visibles en compta uniquement)\n');
  if (excluded.length === 0) {
    console.log('  (aucune)');
  } else {
    const excludedTotal = excluded.reduce((s, e) => s + Number(e.totalAmount), 0);
    console.log(`  ${excluded.length} ligne(s) excluses — Total ${fmt.format(excludedTotal)}`);
    // Regrouper par raison d'exclusion
    const reasons = new Map<string, { count: number; total: number }>();
    for (const e of excluded) {
      let reason = '';
      if (e.sourceType === AccountingSourceType.PURCHASE) {
        reason = 'PURCHASE (déjà via food cost)';
      } else if (!e.includeInFinancialReports) {
        reason = 'Toggle « Inclure » = OFF';
      } else if (!e.accountingCategoryId) {
        reason = 'Sans catégorie dynamique';
      }
      const b = reasons.get(reason) ?? { count: 0, total: 0 };
      b.count += 1;
      b.total += Number(e.totalAmount);
      reasons.set(reason, b);
    }
    for (const [r, { count, total }] of reasons.entries()) {
      console.log(`     • ${r.padEnd(35)} ${String(count).padStart(3)} lignes  ${fmt.format(total).padStart(12)}`);
    }
  }
}

async function main() {
  for (const b of ['Joliette', 'Bishop']) {
    await auditBranch(b);
  }
  console.log('\n' + '='.repeat(78));
  console.log('  📝 Rappel des règles');
  console.log('='.repeat(78));
  console.log(`
  1. Le Rapport Financier "Dépenses totales" =
        Real Cost (Inventaire)
      + Main-d'œuvre (LaborEntry)
      + Σ dépenses comptables qui ont le TOGGLE « Inclure dans les rapports »
        activé, hors PURCHASE (achats fournisseurs déjà comptés via food cost).

  2. La section Comptabilité montre TOUTES les dépenses du mois, sans filtre.

  3. Les 3 raisons d'exclusion possibles :
       a. Toggle « Inclure dans les rapports financiers » = OFF (défaut MANUAL)
       b. Ligne auto PURCHASE (achats — déjà via food cost)
       c. Pas de catégorie dynamique (rows legacy avant migration)
  `);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
