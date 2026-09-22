/**
 * Audit : ventile `realCost` (= ce que le rapport financier appelle "Food
 * cost") par `CategoryType` du produit. Confirme empiriquement que la
 * valeur inclut FOOD + NON_FOOD + PAPIERS + NETTOYAGE — la close() ne fait
 * aucun filtre par type, donc tout produit en inventaire contribue.
 *
 * Read-only.
 */
import { PrismaClient, PeriodStatus } from '@prisma/client';

const prisma = new PrismaClient();

const fmt = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
});

async function main() {
  const closed = await prisma.inventoryPeriod.findMany({
    where: { status: PeriodStatus.CLOSED },
    include: {
      branch: { select: { name: true } },
      report: { select: { realCost: true } },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  if (closed.length === 0) {
    console.log('Aucune période CLOSED.');
    return;
  }

  for (const p of closed) {
    const lines = await prisma.inventoryLine.findMany({
      where: { periodId: p.id },
      include: {
        product: { include: { category: { select: { categoryType: true, name: true } } } },
      },
    });

    const buckets: Record<string, { count: number; consumption: number }> = {};
    let total = 0;

    for (const l of lines) {
      // consumption = (opening - closing) × unitCost + purchasesValue
      // After close(), the line's consumptionValue column already holds this.
      const consumption = Number(l.consumptionValue);
      total += consumption;

      const type = l.product.category?.categoryType ?? 'SANS_CATEGORIE';
      const b = (buckets[type] ??= { count: 0, consumption: 0 });
      b.count += 1;
      b.consumption += consumption;
    }

    console.log(
      `\n${p.branch?.name}  ${String(p.month).padStart(2, '0')}/${p.year}  ` +
        `→  realCost stocké = ${fmt.format(Number(p.report?.realCost ?? 0))}`,
    );
    console.log(`   Σ consumption recalculé = ${fmt.format(total)} ` +
      `(${Math.abs(total - Number(p.report?.realCost ?? 0)) < 0.5 ? '✅ cohérent' : '⚠ écart'})`);
    console.log('   Décomposition par catégorie :');
    for (const [type, { count, consumption }] of Object.entries(buckets).sort(
      (a, b) => Math.abs(b[1].consumption) - Math.abs(a[1].consumption),
    )) {
      const pct = total !== 0 ? ((consumption / total) * 100).toFixed(1) : '—';
      console.log(
        `     • ${type.padEnd(15)} ${String(count).padStart(4)} produit(s)  →  ${fmt
          .format(consumption)
          .padStart(14)}  (${pct} %)`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
