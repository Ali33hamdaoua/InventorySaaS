import { useQuery } from '@tanstack/react-query';
import { Unlock, ShoppingCart, Flame, AlertTriangle } from 'lucide-react';
import { inventoryPeriodsService } from '@/services/inventory-periods.service';
import { KpiCard } from '@/components/charts/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import { currency, toNumber, MONTHS_FR } from '@/lib/utils';
import { useActiveBranch } from '@/hooks/useActiveBranch';

export function InventoryPeriodSummaryCards() {
  const { branchId } = useActiveBranch();
  const query = useQuery({
    queryKey: ['inventory-periods', 'summary', branchId],
    queryFn: () => inventoryPeriodsService.summary(branchId ?? undefined),
    enabled: !!branchId,
  });

  if (query.isLoading || !query.data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const s = query.data;
  const openLabel = s.openPeriod
    ? `${MONTHS_FR[s.openPeriod.month - 1]} ${s.openPeriod.year}`
    : '—';
  const lastClosedLabel = s.lastClosedPeriod
    ? `${MONTHS_FR[s.lastClosedPeriod.month - 1]} ${s.lastClosedPeriod.year}`
    : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Période ouverte"
        value={openLabel}
        hint={s.openPeriod ? 'Saisie en cours' : 'Aucune période ouverte'}
        icon={<Unlock className="h-4 w-4" />}
        accent
      />
      <KpiCard
        title="Achats du mois"
        value={currency.format(toNumber(s.openMonthPurchases))}
        hint={s.openPeriod ? `${openLabel}` : '—'}
        icon={<ShoppingCart className="h-4 w-4" />}
      />
      <KpiCard
        title="Cost réel · dernier mois"
        value={
          s.lastClosedPeriod?.realCost
            ? currency.format(toNumber(s.lastClosedPeriod.realCost))
            : '—'
        }
        hint={lastClosedLabel ?? 'Aucune période clôturée'}
        icon={<Flame className="h-4 w-4" />}
      />
      <KpiCard
        title="Produits critiques"
        value={String(s.criticalProductsCount)}
        hint={s.criticalProductsCount > 0 ? 'Sous le seuil minimum' : 'Aucun produit en alerte'}
        icon={<AlertTriangle className="h-4 w-4" />}
      />
    </div>
  );
}
