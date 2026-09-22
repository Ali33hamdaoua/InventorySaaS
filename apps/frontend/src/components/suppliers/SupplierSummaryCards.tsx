import { Truck, Wallet, Award } from 'lucide-react';
import type { Supplier } from '@/services/suppliers.service';
import { KpiCard } from '@/components/charts/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import { currency, toNumber, parseBusinessDate } from '@/lib/utils';

interface Props {
  suppliers: Supplier[];
  loading?: boolean;
}

export function SupplierSummaryCards({ suppliers, loading }: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const total = suppliers.length;
  const active = suppliers.filter((s) => s.isActive).length;
  const totalAmount = suppliers.reduce((sum, s) => sum + toNumber(s.totalPurchasedAmount), 0);

  // Top supplier of the (last) month — driven by the latest purchase date.
  // TZ-safe: parse YYYY-MM-DD as a local-midnight Date so the comparison
  // against startOfMonth (also local-midnight) doesn't drift across the
  // month boundary in Canada / Maroc.
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyCandidates = suppliers.filter((s) => {
    if (!s.lastPurchaseDate) return false;
    const last = parseBusinessDate(s.lastPurchaseDate);
    return last !== null && last >= startOfMonth;
  });
  const topMonthly = (monthlyCandidates.length > 0 ? monthlyCandidates : suppliers).reduce<
    Supplier | null
  >((best, s) => {
    if (!best) return s;
    return toNumber(s.totalPurchasedAmount) > toNumber(best.totalPurchasedAmount) ? s : best;
  }, null);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Total fournisseurs"
        value={String(total)}
        hint={`${active} actif${active > 1 ? 's' : ''}`}
        icon={<Truck className="h-4 w-4" />}
      />
      <KpiCard
        title="Fournisseurs actifs"
        value={String(active)}
        hint={total > 0 ? `${Math.round((active / total) * 100)} % du parc` : '—'}
        icon={<Truck className="h-4 w-4" />}
      />
      <KpiCard
        title="Total achats"
        value={currency.format(totalAmount)}
        hint="Cumul depuis l'ouverture"
        icon={<Wallet className="h-4 w-4" />}
        accent
      />
      <KpiCard
        title="Top fournisseur (mois)"
        value={topMonthly?.name ?? '—'}
        hint={
          topMonthly
            ? `${currency.format(toNumber(topMonthly.totalPurchasedAmount))} · ${topMonthly.purchasesCount ?? 0} achat(s)`
            : 'Aucun achat ce mois'
        }
        icon={<Award className="h-4 w-4" />}
      />
    </div>
  );
}
