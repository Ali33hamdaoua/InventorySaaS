/**
 * One-shot audit: list every AccountingExpense currently tagged as "Autres"
 * (via the dynamic category table OR the legacy enum column, in case some
 * row dodged the backfill).
 *
 *   pnpm --filter @inventorymdb/backend exec ts-node scripts/audit-autres-expenses.ts
 *
 * Read-only. Safe to run on prod.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function fmtMoney(v: unknown): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(Number.isFinite(n) ? n : 0);
}

function fmtDate(d: Date): string {
  // Force UTC components so the date doesn't drift by a day on negative TZ.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  // Match rows tagged "Autres" either via the new dynamic table (case-
  // insensitive) OR via the legacy enum column. Covers the migration
  // backfill plus any straggler that bypassed it.
  const rows = await prisma.accountingExpense.findMany({
    where: {
      deletedAt: null,
      OR: [
        { accountingCategory: { name: { equals: 'Autres', mode: 'insensitive' } } },
        { category: 'AUTRES' },
      ],
    },
    include: {
      branch: { select: { name: true } },
      supplier: { select: { name: true } },
      accountingCategory: { select: { name: true } },
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
  });

  if (rows.length === 0) {
    console.log('Aucune dépense classée "Autres" — rien à nettoyer. ✅');
    return;
  }

  const total = rows.reduce((s, r) => s + Number(r.totalAmount), 0);

  console.log(
    `\n${rows.length} dépense${rows.length > 1 ? 's' : ''} classée${
      rows.length > 1 ? 's' : ''
    } "Autres" — Total ${fmtMoney(total)}\n`,
  );
  console.log(
    '─'.repeat(140),
  );
  console.log(
    [
      'Date'.padEnd(11),
      'Succ.'.padEnd(10),
      'Source'.padEnd(9),
      'Catégorie (dyn.)'.padEnd(20),
      'enum'.padEnd(8),
      'Fournisseur'.padEnd(22),
      'Description'.padEnd(40),
      'Total'.padStart(12),
    ].join(' │ '),
  );
  console.log('─'.repeat(140));

  for (const r of rows) {
    console.log(
      [
        fmtDate(r.expenseDate).padEnd(11),
        (r.branch?.name ?? '—').slice(0, 10).padEnd(10),
        r.sourceType.padEnd(9),
        (r.accountingCategory?.name ?? '— (null)').slice(0, 20).padEnd(20),
        r.category.padEnd(8),
        (r.supplier?.name ?? r.supplierName ?? '—').slice(0, 22).padEnd(22),
        r.description.slice(0, 40).padEnd(40),
        fmtMoney(r.totalAmount).padStart(12),
      ].join(' │ '),
    );
  }
  console.log('─'.repeat(140));

  // Per-source breakdown — helps decide whether the cleanup needs to touch
  // anything other than MANUAL rows (auto rows shouldn't be tagged "Autres"
  // by construction, but worth flagging).
  const bySource: Record<string, { count: number; total: number }> = {};
  for (const r of rows) {
    const s = (bySource[r.sourceType] ??= { count: 0, total: 0 });
    s.count += 1;
    s.total += Number(r.totalAmount);
  }
  console.log('\nRépartition par source :');
  for (const [src, { count, total: t }] of Object.entries(bySource)) {
    console.log(`  • ${src.padEnd(10)} ${count} ligne(s)  —  ${fmtMoney(t)}`);
  }

  // Per-branch breakdown — useful if Joliette/Bishop have very different
  // habits.
  const byBranch: Record<string, { count: number; total: number }> = {};
  for (const r of rows) {
    const b = (byBranch[r.branch?.name ?? '—'] ??= { count: 0, total: 0 });
    b.count += 1;
    b.total += Number(r.totalAmount);
  }
  console.log('\nRépartition par succursale :');
  for (const [name, { count, total: t }] of Object.entries(byBranch)) {
    console.log(`  • ${name.padEnd(15)} ${count} ligne(s)  —  ${fmtMoney(t)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
