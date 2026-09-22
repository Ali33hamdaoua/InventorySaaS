/**
 * Audit: cross-check the food cost wiring between the Inventory and the
 * Financial Reports modules.
 *
 *   pnpm --filter @inventorymdb/backend exec ts-node scripts/audit-food-cost.ts
 *
 * Read-only. Walks every InventoryPeriod and prints:
 *   - whether an InventoryReport row exists (only created at close()
 *     OR by reconcileClosedReport on admin override)
 *   - the realCost stored in that report
 *   - the matching FinancialReport's foodCost (what the live calc would
 *     read for this branch/month)
 *
 * The two columns should be IDENTICAL on every CLOSED period. On OPEN
 * periods, `Inventory realCost` will be `—` (no report yet) and the
 * financial report's foodCost will fall back to 0.
 */
import { PrismaClient, PeriodStatus } from '@prisma/client';

const prisma = new PrismaClient();

function fmtMoney(v: unknown): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(Number.isFinite(n) ? n : 0);
}

async function main() {
  const periods = await prisma.inventoryPeriod.findMany({
    include: {
      branch: { select: { name: true } },
      report: {
        select: {
          realCost: true,
          openingValue: true,
          purchasesValue: true,
          closingValue: true,
          generatedAt: true,
        },
      },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { branchId: 'asc' }],
  });

  if (periods.length === 0) {
    console.log('Aucune période d\'inventaire en DB.');
    return;
  }

  // For each (branch, year, month), look up the matching FinancialReport (if
  // any) so we can show what the live financial calc would return.
  const reports = await prisma.financialReport.findMany({
    select: {
      branchId: true,
      year: true,
      month: true,
      status: true,
      snapshotFoodCost: true,
    },
  });
  const fxKey = (b: string, y: number, m: number) => `${b}::${y}::${m}`;
  const reportByKey = new Map(reports.map((r) => [fmtKey(r), r] as const));
  function fmtKey(r: { branchId: string; year: number; month: number }) {
    return fxKey(r.branchId, r.year, r.month);
  }

  console.log('\nAudit Food Cost — sources & cohérence\n');
  console.log('─'.repeat(165));
  console.log(
    [
      'Branche'.padEnd(10),
      'Mois'.padEnd(7),
      'Statut'.padEnd(8),
      'Opening'.padStart(12),
      'Achats'.padStart(12),
      'Closing'.padStart(12),
      'realCost (inv.)'.padStart(16),
      'snapshot FR'.padStart(14),
      'Status FR'.padEnd(10),
      'Coh ?'.padEnd(8),
    ].join(' │ '),
  );
  console.log('─'.repeat(165));

  let mismatches = 0;

  for (const p of periods) {
    const monthLbl = `${String(p.month).padStart(2, '0')}/${p.year}`;
    const inv = p.report;
    const fr = reportByKey.get(fxKey(p.branchId, p.year, p.month));

    const invReal = inv?.realCost ? Number(inv.realCost) : null;
    const frSnap =
      fr?.snapshotFoodCost !== null && fr?.snapshotFoodCost !== undefined
        ? Number(fr.snapshotFoodCost)
        : null;

    // Coherence check is only meaningful when both sides have data AND the
    // financial report is LOCKED (snapshot read path). Otherwise the live
    // calc reads `inv.realCost` directly — no possible drift.
    let coherence = 'n/a';
    if (fr?.status === 'LOCKED') {
      if (invReal === null && frSnap === null) coherence = '—';
      else if (invReal === null || frSnap === null) {
        coherence = '⚠ partial';
        mismatches++;
      } else {
        const diff = Math.abs(invReal - frSnap);
        coherence = diff < 0.01 ? '✅' : `⚠ Δ${diff.toFixed(2)}`;
        if (diff >= 0.01) mismatches++;
      }
    } else if (fr) {
      // DRAFT report — live calc reads inv.realCost. So display "live" if
      // the inventory has a report (foodCost will = invReal), or "= 0" if
      // not (period is OPEN, no inventory report yet).
      coherence = invReal !== null ? '↺ live' : '↺ → 0';
    } else {
      coherence = '— no FR';
    }

    console.log(
      [
        (p.branch?.name ?? '—').slice(0, 10).padEnd(10),
        monthLbl.padEnd(7),
        p.status.padEnd(8),
        (inv ? fmtMoney(inv.openingValue) : '—').padStart(12),
        (inv ? fmtMoney(inv.purchasesValue) : '—').padStart(12),
        (inv ? fmtMoney(inv.closingValue) : '—').padStart(12),
        (invReal !== null ? fmtMoney(invReal) : '— (no inv.)').padStart(16),
        (frSnap !== null ? fmtMoney(frSnap) : '—').padStart(14),
        (fr?.status ?? '—').padEnd(10),
        coherence.padEnd(8),
      ].join(' │ '),
    );
  }
  console.log('─'.repeat(165));

  // Summary
  const closed = periods.filter((p) => p.status === PeriodStatus.CLOSED);
  const open = periods.filter((p) => p.status === PeriodStatus.OPEN);
  const closedWithReport = closed.filter((p) => p.report).length;
  const openWithReport = open.filter((p) => p.report).length;

  console.log('\nRésumé :');
  console.log(`  • Périodes CLOSED  : ${closed.length}  (${closedWithReport} avec InventoryReport)`);
  console.log(`  • Périodes OPEN    : ${open.length}  (${openWithReport} avec InventoryReport)`);
  console.log(`  • Rapports financiers : ${reports.length}`);
  console.log(
    `  • Incohérences détectées (LOCKED FR vs Inventory) : ${
      mismatches === 0 ? '0 ✅' : `${mismatches} ⚠`
    }`,
  );

  // Sanity: CLOSED periods without an InventoryReport row are a red flag —
  // the close() flow ALWAYS writes one.
  const closedMissingReport = closed.filter((p) => !p.report);
  if (closedMissingReport.length > 0) {
    console.log(
      `\n⚠️  ${closedMissingReport.length} période(s) CLOSED sans InventoryReport — anomalie de données :`,
    );
    for (const p of closedMissingReport) {
      console.log(`     · ${p.branch?.name} ${p.month}/${p.year}  (id ${p.id})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
