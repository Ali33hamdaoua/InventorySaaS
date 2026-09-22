/**
 * Diagnostic : détecte les achats "fantômes" — factures dont la date
 * tombe dans une période CLOSED, mais dont le montant N'est PAS reflété
 * dans le snapshot `InventoryReport.purchasesValue`.
 *
 * Cas typique : le user a créé un achat APRÈS la clôture du mois. Le
 * snapshot était déjà figé, donc le nouvel achat est invisible côté
 * food cost. La feature « Réouvrir + Re-clôturer » résout ce cas — ce
 * script identifie précisément les factures concernées.
 *
 *   pnpm --filter @inventorymdb/backend exec ts-node scripts/audit-ghost-purchases.ts
 *
 * Read-only, ne modifie rien.
 */
import { PrismaClient, PeriodStatus } from '@prisma/client';

const prisma = new PrismaClient();

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
function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function pad(s: string, n: number, right = false) {
  const str = String(s);
  if (str.length >= n) return str.slice(0, n);
  const p = ' '.repeat(n - str.length);
  return right ? p + str : str + p;
}

/**
 * Refait EXACTEMENT le calcul qu'on ferait à la clôture d'un mois donné,
 * mais SANS écrire quoi que ce soit. Retourne la valeur théorique de
 * `purchasesValue` si on relançait `close()` maintenant.
 */
async function computeLivePurchasesValue(periodId: string, monthStart: Date, monthEndExcl: Date) {
  const [items, lines] = await Promise.all([
    prisma.purchaseItem.findMany({
      where: {
        purchase: { purchaseDate: { gte: monthStart, lt: monthEndExcl } },
      },
      include: {
        purchase: {
          select: {
            id: true,
            purchaseDate: true,
            branchId: true,
            supplier: { select: { name: true } },
          },
        },
      },
    }),
    prisma.inventoryLine.findMany({
      where: { periodId },
      select: { productId: true },
    }),
  ]);
  const linesSet = new Set(lines.map((l) => l.productId));
  const perPurchase = new Map<
    string,
    {
      total: number;
      purchaseDate: string;
      supplier: string;
      branchId: string;
      matchedItems: number;
      totalItems: number;
    }
  >();
  let totalMatched = 0;
  for (const it of items) {
    const inLine = linesSet.has(it.productId);
    const entry = perPurchase.get(it.purchase.id) ?? {
      total: 0,
      purchaseDate: fmtDate(it.purchase.purchaseDate),
      supplier: it.purchase.supplier?.name ?? '—',
      branchId: it.purchase.branchId,
      matchedItems: 0,
      totalItems: 0,
    };
    entry.totalItems += 1;
    if (inLine) {
      entry.total += Number(it.totalPrice);
      entry.matchedItems += 1;
      totalMatched += Number(it.totalPrice);
    }
    perPurchase.set(it.purchase.id, entry);
  }
  return { totalMatched, perPurchase };
}

async function auditBranch(branchName: string) {
  const branch = await prisma.branch.findFirst({
    where: { name: { equals: branchName, mode: 'insensitive' } },
  });
  if (!branch) return;

  const periods = await prisma.inventoryPeriod.findMany({
    where: { branchId: branch.id },
    include: {
      report: { select: { purchasesValue: true, generatedAt: true } },
    },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });

  console.log('\n' + '█'.repeat(110));
  console.log(`  🏪 ${branch.name.toUpperCase()} — Diagnostic des achats fantômes par période`);
  console.log('█'.repeat(110));

  const totalsPerBranchGhosts: Array<{
    month: number;
    year: number;
    ghostAmount: number;
    ghostCount: number;
    purchases: Array<{ id: string; date: string; supplier: string; snapshotHT: number; liveHT: number }>;
  }> = [];

  for (const period of periods) {
    const monthStart = monthStartUTC(period.year, period.month);
    const monthEndExcl = monthEndExclusiveUTC(period.year, period.month);
    const monthLabel = `${String(period.month).padStart(2, '0')}/${period.year}`;

    const snapshot = period.report ? Number(period.report.purchasesValue) : 0;
    const { totalMatched: liveTotal, perPurchase } = await computeLivePurchasesValue(
      period.id,
      monthStart,
      monthEndExcl,
    );
    // Filtrer côté branche : perPurchase contient TOUTES les branches, on
    // ne compare que le sous-total de CETTE branche.
    let liveBranch = 0;
    const purchasesThisBranch: typeof perPurchase = new Map();
    for (const [id, p] of perPurchase.entries()) {
      if (p.branchId === branch.id) {
        liveBranch += p.total;
        purchasesThisBranch.set(id, p);
      }
    }

    const drift = liveBranch - snapshot;
    const statusIcon =
      period.status === PeriodStatus.CLOSED
        ? drift > 0.5
          ? '👻 ACHATS FANTÔMES'
          : drift < -0.5
            ? '⚠ Snapshot > live (bizarre)'
            : '✅ Snapshot cohérent'
        : '↺ OPEN — live';

    console.log(
      `\n  ${monthLabel}  status=${period.status.padEnd(6)}  ` +
        `snapshot=${fmt.format(snapshot).padStart(11)}  live=${fmt.format(liveBranch).padStart(11)}  ` +
        `diff=${(drift >= 0 ? '+' : '') + fmt.format(drift).padStart(10)}  ${statusIcon}`,
    );
    if (period.report) {
      console.log(`     (snapshot figé le ${fmtDate(period.report.generatedAt)})`);
    }

    if (period.status === PeriodStatus.CLOSED && drift > 0.5) {
      // Il y a des achats fantômes — pour lister lesquels, on doit trouver
      // ceux dont la valeur est dans le live mais absente du snapshot.
      // On ne peut pas reconstruire exactement lequel a été ajouté après
      // le close (pas d'audit fin sur ça), MAIS on peut identifier ceux
      // dont la date de CRÉATION est > snapshot.generatedAt (heuristique).
      const purchases = await prisma.purchase.findMany({
        where: {
          id: { in: [...purchasesThisBranch.keys()] },
        },
        select: {
          id: true,
          purchaseDate: true,
          createdAt: true,
          updatedAt: true,
          subtotalHT: true,
          supplier: { select: { name: true } },
        },
      });
      const snapshotTs = period.report?.generatedAt ?? new Date(0);
      const suspicious = purchases.filter(
        (p) => p.createdAt > snapshotTs || p.updatedAt > snapshotTs,
      );
      console.log(`\n     🔍 Achats créés/modifiés APRÈS le close (dérive probable) :`);
      if (suspicious.length === 0) {
        console.log(`        (aucun identifié via createdAt/updatedAt — ` +
          `mais un drift de ${fmt.format(drift)} existe. Peut-être un item ajouté sur une facture existante.)`);
      }
      for (const p of suspicious) {
        const marker = p.createdAt > snapshotTs ? '🆕 créé après' : '✏ modifié après';
        console.log(
          `        ${marker}  ${fmtDate(p.purchaseDate)}  ${pad(p.supplier?.name ?? '—', 22)}  ` +
            `HT=${fmt.format(Number(p.subtotalHT)).padStart(9)}  ` +
            `createdAt=${fmtDate(p.createdAt)}  updatedAt=${fmtDate(p.updatedAt)}`,
        );
        totalsPerBranchGhosts.push({
          month: period.month,
          year: period.year,
          ghostAmount: Number(p.subtotalHT),
          ghostCount: 1,
          purchases: [
            {
              id: p.id,
              date: fmtDate(p.purchaseDate),
              supplier: p.supplier?.name ?? '—',
              snapshotHT: snapshot,
              liveHT: liveBranch,
            },
          ],
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Résumé
  // ------------------------------------------------------------------
  const totalGhostAmount = totalsPerBranchGhosts.reduce((s, x) => s + x.ghostAmount, 0);
  const totalGhostCount = totalsPerBranchGhosts.reduce((s, x) => s + x.ghostCount, 0);
  console.log(`\n  🎯 Résumé ${branch.name} :`);
  console.log(`     ${totalGhostCount} achat(s) fantôme(s) identifié(s) — Total ${fmt.format(totalGhostAmount)}`);
  if (totalGhostCount > 0) {
    console.log(`\n     ➡️  Action recommandée : sur chaque période concernée →`);
    console.log(`        1. Cliquer « Réouvrir » (icône Unlock, OWNER/ADMIN)`);
    console.log(`        2. Cliquer « Clôturer » à nouveau`);
    console.log(`        Les fantômes seront réintégrés dans le snapshot.`);
    console.log(`        Aucune donnée n'est modifiée manuellement.`);
  }
}

async function main() {
  for (const b of ['Bishop', 'Joliette']) {
    await auditBranch(b);
  }
  console.log('\n' + '█'.repeat(110));
  console.log(`  📝 Interprétation`);
  console.log('█'.repeat(110));
  console.log(`
  • Un « achat fantôme » = facture dont la date tombe dans un mois CLOSED,
    mais dont le montant N'est PAS dans le snapshot InventoryReport.
    → Cause principale : facture créée/modifiée APRÈS la clôture du mois.

  • Le snapshot est figé au moment du close(). Toute modification postérieure
    (nouvel achat, edit d'un existant, ajout d'un item) n'est reflétée que si
    l'on : (a) Réouvre, (b) Re-clôture.

  • Un drift NÉGATIF (snapshot > live) est inhabituel. Cela voudrait dire
    qu'un achat a été supprimé après le close. À investiguer.

  • Un drift POSITIF (live > snapshot) = achats fantômes → suivre la
    procédure « Réouvrir + Re-clôturer » sur la période concernée.
  `);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
