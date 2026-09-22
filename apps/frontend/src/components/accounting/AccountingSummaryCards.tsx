import { useQuery } from '@tanstack/react-query';
import { Wallet, Receipt, Layers } from 'lucide-react';
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const s = summaryQ.data;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        title={`Total — ${s.selectedPeriod}`}
        value={currency.format(s.totalBeforeTax)}
        hint={
          s.expensesCount > 0
            ? `${s.expensesCount} dépense${s.expensesCount > 1 ? 's' : ''}`
            : 'Aucune dépense'
        }
        icon={<Wallet className="h-4 w-4" />}
        accent
      />
      <KpiCard
        title="Total"
        value={currency.format(s.totalBeforeTax)}
        hint="Somme des dépenses"
        icon={<Receipt className="h-4 w-4" />}
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
