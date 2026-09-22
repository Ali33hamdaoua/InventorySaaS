import { Sparkles, Wallet, ShoppingCart, Boxes, Flame, AlertTriangle } from 'lucide-react';
import type { InventoryPeriod } from '@/services/inventory-periods.service';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { currency, toNumber } from '@/lib/utils';

interface Props {
  period: InventoryPeriod | null;
  /** Live aggregates recomputed from the lines currently in memory
   *  (reflects dirty edits before they hit the server). */
  openingValue: number;
  closingValue: number;
  purchasesValue: number;
  criticalCount: number;
  loading?: boolean;
}

export function InventorySummaryPanel({
  period,
  openingValue,
  closingValue,
  purchasesValue,
  criticalCount,
  loading,
}: Props) {
  if (loading || !period) {
    return <Skeleton className="h-40 w-full" />;
  }
  const realCost = openingValue + purchasesValue - closingValue;

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.05] to-transparent">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary via-primary/60 to-transparent"
      />
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
              Résumé business
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/90">
              Cost réel ={' '}
              <span className="font-medium">{currency.format(openingValue)}</span> +{' '}
              <span className="font-medium">{currency.format(purchasesValue)}</span> −{' '}
              <span className="font-medium">{currency.format(closingValue)}</span> ={' '}
              <span className="font-semibold text-primary">{currency.format(realCost)}</span>
              {criticalCount > 0 && (
                <>
                  {' '}· <span className="text-amber-400">{criticalCount} produit(s) critique(s)</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MiniMetric label="Début" value={currency.format(openingValue)} icon={<Wallet className="h-3.5 w-3.5" />} />
          <MiniMetric
            label="Achats"
            value={currency.format(purchasesValue)}
            icon={<ShoppingCart className="h-3.5 w-3.5" />}
          />
          <MiniMetric label="Fin" value={currency.format(closingValue)} icon={<Boxes className="h-3.5 w-3.5" />} />
          <MiniMetric
            label="Cost réel"
            value={currency.format(realCost)}
            icon={<Flame className="h-3.5 w-3.5" />}
            accent
          />
          <MiniMetric
            label="Critiques"
            value={String(criticalCount)}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm font-semibold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}
      >
        {value}
      </div>
    </div>
  );
}

// Convenience re-export so callers don't need the helper.
export { toNumber };
