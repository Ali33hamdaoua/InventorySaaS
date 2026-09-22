import { Eye, Lock, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { InventoryPeriod } from '@/services/inventory-periods.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InventoryPeriodStatusBadge } from './InventoryPeriodStatusBadge';
import { currency, formatPercent, toNumber, cn, MONTHS_FR } from '@/lib/utils';

interface Props {
  periods: InventoryPeriod[];
  loading?: boolean;
  onClose: (p: InventoryPeriod) => void;
}

export function InventoryPeriodsTable({ periods, loading, onClose }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-3 pb-2 font-medium">Période</th>
            <th className="px-3 pb-2 font-medium">Statut</th>
            <th className="px-3 pb-2 text-right font-medium">Début</th>
            <th className="hidden px-3 pb-2 text-right font-medium md:table-cell">Achats</th>
            <th className="px-3 pb-2 text-right font-medium">Fin</th>
            {/* V4 ventilation : 3 colonnes Food / Paper / Cleaning visibles
                sur écrans larges seulement (mobile garde Real Cost suffit). */}
            <th className="hidden px-3 pb-2 text-right font-medium xl:table-cell">Food</th>
            <th className="hidden px-3 pb-2 text-right font-medium xl:table-cell">Paper</th>
            <th className="hidden px-3 pb-2 text-right font-medium xl:table-cell">Cleaning</th>
            <th className="px-3 pb-2 text-right font-medium">Real cost</th>
            <th className="hidden px-3 pb-2 text-right font-medium lg:table-cell">Food cost %</th>
            <th className="hidden px-3 pb-2 text-center font-medium lg:table-cell">Critiques</th>
            <th className="px-3 pb-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : periods.map((p) => {
                const opening = toNumber(p.openingValue);
                const purchases = toNumber(p.purchasesValue);
                const closing = toNumber(p.closingValue);
                const realCost = toNumber(p.realCost);
                // V4 ventilation : valeurs ventilées par catégorie. Pour les
                // périodes pré-migration, paperCost et cleaningCost sont 0
                // et foodCost = realCost — la table reste cohérente.
                const foodCost = toNumber(p.foodCost);
                const paperCost = toNumber(p.paperCost);
                const cleaningCost = toNumber(p.cleaningCost);
                const foodCostPct = p.foodCostPercentage ? toNumber(p.foodCostPercentage) : null;
                const critical = p.criticalProductsCount ?? 0;
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      'border-b border-border/40 transition-colors last:border-0 hover:bg-[var(--hover-overlay)]',
                    )}
                  >
                    <td className="px-3 py-3 font-medium">
                      {MONTHS_FR[p.month - 1]}{' '}
                      <span className="text-muted-foreground">{p.year}</span>
                    </td>
                    <td className="px-3 py-3">
                      <InventoryPeriodStatusBadge status={p.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      {currency.format(opening)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums md:table-cell">
                      {currency.format(purchases)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      {currency.format(closing)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums xl:table-cell">
                      {currency.format(foodCost)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums xl:table-cell">
                      {currency.format(paperCost)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums xl:table-cell">
                      {currency.format(cleaningCost)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-primary">
                      {currency.format(realCost)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums lg:table-cell">
                      {foodCostPct == null ? (
                        <span className="text-xs text-muted-foreground">Non renseigné</span>
                      ) : (
                        formatPercent(foodCostPct)
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-center lg:table-cell">
                      {critical > 0 ? (
                        <Badge variant="danger" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {critical}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          aria-label={`Voir détail ${MONTHS_FR[p.month - 1]} ${p.year}`}
                        >
                          <Link to={`/inventory/${p.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Voir</span>
                          </Link>
                        </Button>
                        {p.status === 'OPEN' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onClose(p)}
                            className="gap-1.5 text-primary hover:text-primary"
                            aria-label="Clôturer la période"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Clôturer</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
