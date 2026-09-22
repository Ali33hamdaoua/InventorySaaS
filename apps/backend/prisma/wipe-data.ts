/**
 * One-shot data wipe — empties every business table while preserving:
 *   - the two seeded branches (Joliette + Bishop)
 *   - the single bootstrap admin user (admin@inventorymdb.local)
 *
 * Run with:  pnpm --filter @inventorymdb/backend exec ts-node prisma/wipe-data.ts
 *
 * Safe to re-run: every delete is unconditional except the two preservation
 * filters at the bottom.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KEEP_BRANCH_IDS = [
  '11111111-1111-1111-1111-111111111111', // Joliette
  '22222222-2222-2222-2222-222222222222', // Bishop
];
const KEEP_ADMIN_EMAIL = 'admin@inventorymdb.local';

async function main() {
  /* eslint-disable no-console */
  console.log('⚠️  Wiping all business data — keeping only the bootstrap admin + 2 branches…');

  // Order matters because of foreign keys.
  const counts: Array<[string, number]> = [];

  counts.push(['purchaseItems', (await prisma.purchaseItem.deleteMany()).count]);
  counts.push(['purchases', (await prisma.purchase.deleteMany()).count]);
  counts.push(['inventoryLines', (await prisma.inventoryLine.deleteMany()).count]);
  counts.push(['inventoryReports', (await prisma.inventoryReport.deleteMany()).count]);
  counts.push(['inventoryPeriods', (await prisma.inventoryPeriod.deleteMany()).count]);
  counts.push(['accountingExpenses', (await prisma.accountingExpense.deleteMany()).count]);
  counts.push(['inventoryProducts', (await prisma.inventoryProduct.deleteMany()).count]);
  counts.push(['categories', (await prisma.category.deleteMany()).count]);
  counts.push(['suppliers', (await prisma.supplier.deleteMany()).count]);
  counts.push(['auditLogs', (await prisma.auditLog.deleteMany()).count]);

  // Users: delete every account except the bootstrap admin.
  const usersDeleted = await prisma.user.deleteMany({
    where: { email: { not: KEEP_ADMIN_EMAIL } },
  });
  counts.push(['users (non-admin)', usersDeleted.count]);

  // If the admin had a branchId set, clear it — keeps the OWNER/ADMIN
  // cross-branch semantic and prevents stale FK display.
  const admin = await prisma.user.findUnique({
    where: { email: KEEP_ADMIN_EMAIL },
    select: { id: true, branchId: true, role: true, isActive: true },
  });
  if (admin) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { branchId: null, isActive: true },
    });
  } else {
    console.warn(
      `⚠️  Admin user "${KEEP_ADMIN_EMAIL}" introuvable — relancez "pnpm db:seed" pour le recréer.`,
    );
  }

  // Branches: keep only the two seeded ones (delete any extra that may have
  // been created via the UI for tests).
  const extraBranches = await prisma.branch.deleteMany({
    where: { id: { notIn: KEEP_BRANCH_IDS } },
  });
  counts.push(['branches (extra)', extraBranches.count]);

  console.log('\n📊 Deletion summary:');
  for (const [table, n] of counts) {
    console.log(`   - ${table.padEnd(28)} : ${n}`);
  }

  // Sanity check — show what remains.
  const remaining = {
    branches: await prisma.branch.count(),
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    suppliers: await prisma.supplier.count(),
    inventoryProducts: await prisma.inventoryProduct.count(),
    purchases: await prisma.purchase.count(),
    inventoryPeriods: await prisma.inventoryPeriod.count(),
    accountingExpenses: await prisma.accountingExpense.count(),
  };
  console.log('\n✅ Remaining rows:');
  for (const [k, v] of Object.entries(remaining)) {
    console.log(`   - ${k.padEnd(28)} : ${v}`);
  }
  console.log('\nDone. The system is empty — the client can now create their own data.');
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
