/**
 * One-shot reclassification: take every expense currently tagged "Autres"
 * for a given branch and re-attach it to a dynamic category named after
 * the row's own description. The user reviewed the data in the audit and
 * confirmed "change autre par sa description, pas plus".
 *
 * Run for the default (Joliette):
 *   pnpm --filter @inventorymdb/backend exec ts-node scripts/reclassify-joliette-autres.ts
 *
 * Run for another branch:
 *   pnpm --filter @inventorymdb/backend exec ts-node scripts/reclassify-joliette-autres.ts Bishop
 *
 * Safety:
 *   - One Prisma transaction. Any failure rolls back every change — the
 *     table can never end up half-migrated.
 *   - Branches that aren't the target are left untouched (strict filter).
 *   - Auto rows (PURCHASE / REPAIR) are skipped by construction.
 *   - Dedup via the existing `findOrCreate` helper: case-insensitive,
 *     trimmed, so a description matching an already-existing category
 *     (created by an earlier branch's run, or pre-existing) reuses it
 *     instead of creating a duplicate.
 */
import {
  AccountingSourceType,
  PrismaClient,
  Prisma,
} from '@prisma/client';

const prisma = new PrismaClient();

function fmtMoney(v: unknown): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(Number.isFinite(n) ? n : 0);
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Inline copy of the production `findOrCreate` logic — same trim +
 * case-insensitive dedup rules. Kept local so the script can run with
 * just the Prisma client (no Nest DI bootstrap).
 */
async function findOrCreateCategory(
  tx: Prisma.TransactionClient,
  rawName: string,
): Promise<{ id: string; name: string; created: boolean }> {
  const name = rawName.trim();
  if (!name) {
    throw new Error('Description vide — impossible de créer une catégorie.');
  }
  if (name.length > 120) {
    throw new Error(`Description trop longue (>${120} caractères) : "${name}".`);
  }
  const existing = await tx.accountingCategory.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
  if (existing) {
    return { id: existing.id, name: existing.name, created: false };
  }
  const created = await tx.accountingCategory.create({ data: { name } });
  return { id: created.id, name: created.name, created: true };
}

async function main() {
  // 1. Resolve target branch — first CLI arg, defaults to Joliette to keep
  //    backwards compat with the original one-shot invocation.
  const branchArg = process.argv[2]?.trim() || 'Joliette';
  const joliette = await prisma.branch.findFirst({
    where: { name: { equals: branchArg, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (!joliette) {
    throw new Error(`Branche "${branchArg}" introuvable.`);
  }
  console.log(`\n📍 Cible : ${joliette.name}`);

  // 2. Find the "Autres" category (now inactive — that's fine, we read it
  //    purely to scope the rows).
  const autresCat = await prisma.accountingCategory.findFirst({
    where: { name: { equals: 'Autres', mode: 'insensitive' } },
    select: { id: true, name: true, isActive: true },
  });

  // 3. Pull every Joliette MANUAL row tagged "Autres" via either route.
  const rows = await prisma.accountingExpense.findMany({
    where: {
      branchId: joliette.id,
      deletedAt: null,
      sourceType: AccountingSourceType.MANUAL,
      OR: [
        ...(autresCat ? [{ accountingCategoryId: autresCat.id }] : []),
        { category: 'AUTRES' as const },
      ],
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
  });

  if (rows.length === 0) {
    console.log(`Aucune ligne ${joliette.name} tagguée "Autres" — rien à reclasser. ✅`);
    return;
  }

  console.log(
    `\n${rows.length} ligne(s) ${joliette.name} à reclasser (chaque ligne → catégorie = sa description).\n`,
  );

  // 4. Atomic batch: create the categories on the fly + update each row.
  //    A single transaction means partial failure is impossible. The bumped
  //    timeout / maxWait protect against Supabase's PgBouncer killing the
  //    connection while we serially walk 11 rows over an ocean-wide round
  //    trip (default 5 s isn't enough for chatty scripts run from Windows).
  const result = await prisma.$transaction(async (tx) => {
    const changes: Array<{
      expenseId: string;
      date: string;
      total: string;
      description: string;
      oldCategory: string;
      newCategory: string;
      categoryCreated: boolean;
    }> = [];

    for (const r of rows) {
      const cat = await findOrCreateCategory(tx, r.description);
      await tx.accountingExpense.update({
        where: { id: r.id },
        data: { accountingCategoryId: cat.id },
      });
      changes.push({
        expenseId: r.id,
        date: fmtDate(r.expenseDate),
        total: fmtMoney(r.totalAmount),
        description: r.description,
        oldCategory: autresCat?.name ?? 'Autres',
        newCategory: cat.name,
        categoryCreated: cat.created,
      });
    }

    return changes;
  }, { timeout: 60_000, maxWait: 15_000 });

  // 5. Report — one line per change so the user can audit visually.
  console.log('─'.repeat(120));
  for (const c of result) {
    const marker = c.categoryCreated ? '🆕' : '♻️';
    console.log(
      [
        c.date.padEnd(11),
        `${c.total.padStart(12)}`,
        `${c.oldCategory.padEnd(8)} → ${marker} ${c.newCategory.padEnd(28)}`,
        c.description,
      ].join('  │  '),
    );
  }
  console.log('─'.repeat(120));

  const createdCount = result.filter((c) => c.categoryCreated).length;
  const reusedCount = result.length - createdCount;
  console.log(
    `\n✅ ${result.length} dépense(s) reclassée(s) en transaction.`,
  );
  console.log(`   • ${createdCount} nouvelle(s) catégorie(s) créée(s)`);
  console.log(`   • ${reusedCount} reliée(s) à une catégorie existante`);
  console.log(
    `   Toutes ces catégories apparaîtront automatiquement dans le dropdown au prochain refresh.`,
  );
}

main()
  .catch((e) => {
    console.error('\n❌ Échec — la transaction a été annulée. Aucune donnée modifiée.\n');
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
