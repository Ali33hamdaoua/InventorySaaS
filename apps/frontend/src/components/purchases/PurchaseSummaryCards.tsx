import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Wallet, Award, ReceiptText } from 'lucide-react';
import { purchasesService } from '@/services/purchases.service';
import { KpiCard } from '@/components/charts/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import { currency, toNumber, MONTHS_FR } from '@/lib/utils';
import { useActiveBranch } from '@/hooks/useActiveBranch';

export function PurchaseSummaryCards() {
  const { branchId } = useActiveBranch();
  const summaryQuery = useQuery({
    queryKey: ['purchases', 'summary', branchId],
    queryFn: () => purchasesService.summary({ branchId: branchId ?? undefined }),
    enabled: !!branchId,
  });

  if (summaryQuery.isLoading || !summaryQuery.data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const s = summaryQuery.data;
  const total = toNumber(s.totalAmount);
  const avg = toNumber(s.averageBasket);
  const monthLabel = `${MONTHS_FR[s.month - 1]} ${s.year}`;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title={`Total — ${monthLabel}`}
        value={currency.format(total)}
        hint="Achats facturés (hors annulés)"
        icon={<Wallet className="h-4 w-4" />}
        accent
      />
      <KpiCard
        title="Nombre d'achats"
        value={String(s.purchasesCount)}
        hint={s.purchasesCount > 0 ? `${s.purchasesCount} facture(s)` : 'Aucun achat ce mois'}
        icon={<ShoppingCart className="h-4 w-4" />}
      />
      <KpiCard
        title="Panier moyen"
        value={currency.format(avg)}
        hint={s.purchasesCount > 0 ? 'Par bon d\'achat' : '—'}
        icon={<ReceiptText className="h-4 w-4" />}
      />
      <KpiCard
        title="Top fournisseur"
        value={s.topSupplier?.name ?? '—'}
        hint={
          s.topSupplier
            ? currency.format(toNumber(s.topSupplier.totalAmount))
            : 'Aucun achat ce mois'
        }
        icon={<Award className="h-4 w-4" />}
      />
    </div>
  );
}
