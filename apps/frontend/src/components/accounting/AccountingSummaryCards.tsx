import { useQuery } from '@tanstack/react-query';
import { Wallet, Receipt, Percent, Layers } from 'lucide-react';
import {
  accountingService,
  type AccountingSummaryParams,
} from '@/services/accounting.service';
import { KpiCard } from '@/components/charts/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import { currency } from '@/lib/utils';

interface Props {
  params: AccountingSummaryParams;
}

export function AccountingSummaryCards({ params }: Props) {
  const summaryQ = useQuery({
    queryKey: ['accounting', 'summary', params],
    queryFn: () => accountingService.summary(params),
    placeholderData: (prev) => prev,
  });

  if (summaryQ.isLoading || !summaryQ.data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const s = summaryQ.data;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        title={`Total TTC — ${s.selectedPeriod}`}
        value={currency.format(s.totalWithTax)}
        hint={
          s.expensesCount > 0
            ? `${s.expensesCount} dépense${s.expensesCount > 1 ? 's' : ''}`
            : 'Aucune dépense'
        }
        icon={<Wallet className="h-4 w-4" />}
        accent
      />
      <KpiCard
        title="Total HT"
        value={currency.format(s.totalBeforeTax)}
        hint="Hors taxes"
        icon={<Receipt className="h-4 w-4" />}
      />
      <KpiCard
        title="TPS"
        value={currency.format(s.totalTPS)}
        hint="Taxe fédérale collectée"
        icon={<Percent className="h-4 w-4" />}
      />
      <KpiCard
        title="TVQ"
        value={currency.format(s.totalTVQ)}
        hint="Taxe provinciale collectée"
        icon={<Percent className="h-4 w-4" />}
      />
      <KpiCard
        title="Dépenses"
        value={String(s.expensesCount)}
        hint={
          s.topCategory
            ? `Top : ${s.topCategory.label} · ${currency.format(s.topCategory.totalAmount)}`
            : 'Aucune dépense'
        }
        icon={<Layers className="h-4 w-4" />}
      />
    </div>
  );
}
