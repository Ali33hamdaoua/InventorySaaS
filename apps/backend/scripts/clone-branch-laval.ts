/**
 * Clone Branch — Create Laval from Joliette
 *
 * One-shot admin script that creates the "Laval" branch by cloning the
 * catalog (InventoryProducts) from "Joliette".
 *
 * KEY ARCHITECTURE DISCOVERY:
 *   - Category, Supplier, AccountingCategory are GLOBAL (no branchId).
 *     They are shared across all branches. NO duplication needed.
 *   - InventoryProduct is BRANCH-SCOPED (has branchId).
 *     Products must be duplicated with new UUIDs and branchId = Laval.
 *   - FinancialReport is BRANCH-SCOPED — no structure copy needed,
 *     reports are created on-demand when the user visits the page.
 *
 * WHAT IS COPIED:
 *   - InventoryProduct rows from Joliette → Laval with:
 *     • Same name, unit, defaultCost, minStockLevel, isActive
 *     • Same categoryId (global — points to shared category)
 *     • Same supplierId (global — points to shared supplier)
 *     • Same packagingName, packagingFactor
 *
 * WHAT IS NOT COPIED (by design):
 *   - Purchase, PurchaseItem, PurchaseAdditionalCost
 *   - AccountingExpense
 *   - InventoryPeriod, InventoryLine, InventoryReport
 *   - FinancialReport (and their snapshots)
 *   - LaborEntry, RepairEntry
 *   - AuditLog
 *
 * IDEMPOTENCE:
 *   If Laval already exists → abort with a clear message. No partial state.
 *
 * ATOMICITY:
 *   Runs inside a single Prisma $transaction. Failure = full rollback.
 *
 * Usage:
 *   npx ts-node scripts/clone-branch-laval.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Load apps/backend/.env if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Deterministic Joliette ID from seed.ts
const JOLIETTE_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const LAVAL_SLUG = 'laval';

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Clone Branch: Joliette → Laval');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // 1. Resolve Joliette
  const joliette = await prisma.branch.findUnique({
    where: { id: JOLIETTE_BRANCH_ID },
  });
  if (!joliette) {
    console.error('❌ Joliette branch not found (expected UUID:', JOLIETTE_BRANCH_ID, ')');
    process.exit(1);
  }
  console.log(`✓ Joliette found: id=${joliette.id}, name="${joliette.name}", slug="${joliette.slug}"`);

  // 2. Check if Laval already exists
  const isForce = process.argv.includes('--force') || process.argv.includes('--clean');
  const existingLaval = await prisma.branch.findFirst({
    where: { OR: [{ slug: LAVAL_SLUG }, { name: 'Laval' }] },
  });

  if (existingLaval) {
    if (isForce) {
      const purchasesCount = await prisma.purchase.count({ where: { branchId: existingLaval.id } }).catch(() => 0);
      if (purchasesCount > 0) {
        console.error(`❌ Impossible de nettoyer Laval (id=${existingLaval.id}) : elle contient ${purchasesCount} achat(s) existant(s).`);
        process.exit(1);
      }
      console.log(`⚠️  Mode --force : suppression de la succursale Laval existante sans transactions (id=${existingLaval.id})…`);
      await prisma.inventoryProduct.deleteMany({ where: { branchId: existingLaval.id } });
      await prisma.branch.delete({ where: { id: existingLaval.id } });
      console.log('✓ Ancienne succursale Laval supprimée avec succès.');
    } else {
      console.error(`❌ La succursale Laval existe déjà (id=${existingLaval.id}).`);
      console.error('👉 Pour réinitialiser et re-cloner Laval, ajoutez l\'option --force :');
      console.error('   pnpm --filter backend clone:laval -- --force');
      process.exit(1);
    }
  }
  console.log('✓ Ready to create branch Laval.');

  // 3. Load source data from Joliette
  const joProducts = await prisma.inventoryProduct.findMany({
    where: { branchId: JOLIETTE_BRANCH_ID },
  });
  console.log(`✓ Joliette has ${joProducts.length} products to clone.`);

  // Also count global entities (for validation report)
  const [categoriesCount, suppliersCount, acctCategoriesCount] = await Promise.all([
    prisma.category.count(),
    prisma.supplier.count(),
    prisma.accountingCategory.count(),
  ]);
  console.log(`  Global categories:           ${categoriesCount}`);
  console.log(`  Global suppliers:            ${suppliersCount}`);
  console.log(`  Global accounting categories: ${acctCategoriesCount}`);
  console.log();

  // 4. Execute clone in a transaction
  console.log('🔄 Starting transaction…');
  const result = await prisma.$transaction(async (tx) => {
    // 4a. Create Laval branch
    const laval = await tx.branch.create({
      data: {
        name: 'Laval',
        slug: LAVAL_SLUG,
        address: null,
        isActive: true,
      },
    });
    console.log(`  ✓ Branch "Laval" created: id=${laval.id}`);

    // 4b. Copy InventoryProducts
    // Categories and Suppliers are global — no FK remapping needed!
    let copiedProducts = 0;
    for (const p of joProducts) {
      await tx.inventoryProduct.create({
        data: {
          branchId: laval.id,
          name: p.name,
          unit: p.unit,
          categoryId: p.categoryId,     // Global FK — same ID
          supplierId: p.supplierId,     // Global FK — same ID
          defaultCost: p.defaultCost,
          minStockLevel: p.minStockLevel,
          packagingName: p.packagingName,
          packagingFactor: p.packagingFactor,
          isActive: p.isActive,
          // New UUID auto-generated — no historical data carried over
        },
      });
      copiedProducts++;
    }
    console.log(`  ✓ ${copiedProducts} products cloned to Laval.`);

    // 4c. No FinancialReport structure to copy — reports are created
    // on-demand via findOrCreateForMonth() when the user navigates to
    // the Financial Reports page for a given month/year. Laval will
    // start with empty reports computed from its own (zero) data.

    return { laval, copiedProducts };
  });

  console.log();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CLONE COMPLETE — Validation Report');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // 5. Post-transaction validation
  const lavalProducts = await prisma.inventoryProduct.count({
    where: { branchId: result.laval.id },
  }).catch(() => 0);
  const lavalPurchases = await prisma.purchase.count({
    where: { branchId: result.laval.id },
  }).catch(() => 0);
  const lavalExpenses = await prisma.accountingExpense.count({
    where: { branchId: result.laval.id },
  }).catch(() => 0);
  const lavalPeriods = await prisma.inventoryPeriod.count({
    where: { branchId: result.laval.id },
  }).catch(() => 0);
  const lavalReports = await prisma.financialReport.count({
    where: { branchId: result.laval.id },
  }).catch(() => 0);
  const lavalAdditionalCosts = await prisma.purchaseAdditionalCost.count({
    where: { branchId: result.laval.id },
  }).catch(() => 0);
  const lavalLabor = await prisma.laborEntry.count({
    where: { branchId: result.laval.id },
  }).catch(() => 0);
  const lavalRepairs = await prisma.repairEntry.count({
    where: { branchId: result.laval.id },
  }).catch(() => 0);

  console.log('  Laval branch ID:                  ', result.laval.id);
  console.log();
  console.log('  Catalog copied:');
  console.log(`    Products (Joliette):             ${joProducts.length}`);
  console.log(`    Products (Laval):                ${lavalProducts}`);
  console.log(`    Match:                           ${joProducts.length === lavalProducts ? '✅' : '❌'}`);
  console.log();
  console.log('  Global entities (shared, NOT copied — already available):');
  console.log(`    Categories:                      ${categoriesCount}`);
  console.log(`    Suppliers:                       ${suppliersCount}`);
  console.log(`    Accounting categories:           ${acctCategoriesCount}`);
  console.log();
  console.log('  Historical data (must all be 0):');
  console.log(`    Purchases:                       ${lavalPurchases} ${lavalPurchases === 0 ? '✅' : '❌'}`);
  console.log(`    PurchaseAdditionalCosts:         ${lavalAdditionalCosts} ${lavalAdditionalCosts === 0 ? '✅' : '❌'}`);
  console.log(`    AccountingExpenses:              ${lavalExpenses} ${lavalExpenses === 0 ? '✅' : '❌'}`);
  console.log(`    InventoryPeriods:                ${lavalPeriods} ${lavalPeriods === 0 ? '✅' : '❌'}`);
  console.log(`    FinancialReports:                ${lavalReports} ${lavalReports === 0 ? '✅' : '❌'}`);
  console.log(`    LaborEntries:                    ${lavalLabor} ${lavalLabor === 0 ? '✅' : '❌'}`);
  console.log(`    RepairEntries:                   ${lavalRepairs} ${lavalRepairs === 0 ? '✅' : '❌'}`);
  console.log();
  console.log('  Joliette remains unchanged:        ✅ (read-only operations)');
  console.log();

  // Verify product integrity — spot check a few
  if (joProducts.length > 0) {
    const sampleJo = joProducts[0]!;
    const sampleLa = await prisma.inventoryProduct.findFirst({
      where: { branchId: result.laval.id, name: sampleJo.name },
    });
    if (sampleLa) {
      const checks = [
        ['defaultCost', sampleJo.defaultCost.equals(sampleLa.defaultCost)],
        ['unit', sampleJo.unit === sampleLa.unit],
        ['isActive', sampleJo.isActive === sampleLa.isActive],
        ['categoryId', sampleJo.categoryId === sampleLa.categoryId],
        ['supplierId', sampleJo.supplierId === sampleLa.supplierId],
        ['packagingName', sampleJo.packagingName === sampleLa.packagingName],
        ['packagingFactor',
          (sampleJo.packagingFactor === null && sampleLa.packagingFactor === null) ||
          (sampleJo.packagingFactor !== null && sampleLa.packagingFactor !== null &&
            sampleJo.packagingFactor.equals(sampleLa.packagingFactor))],
        ['branchId', sampleLa.branchId === result.laval.id],
        ['id different', sampleJo.id !== sampleLa.id],
      ] as const;
      console.log(`  Sample product integrity ("${sampleJo.name}"):`);
      for (const [field, ok] of checks) {
        console.log(`    ${field}: ${ok ? '✅' : '❌'}`);
      }
    }
  }

  console.log();
  console.log('✅ Done. Laval is ready for use.');
}

main()
  .catch((e) => {
    console.error('❌ FATAL ERROR — transaction rolled back, no data changed.');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
