import { Eye, Pencil, Trash2 } from 'lucide-react';
import type { Purchase } from '@/services/purchases.service';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { currency, toNumber, formatBusinessDate } from '@/lib/utils';

interface Props {
  purchases: Purchase[];
  loading?: boolean;
  onView: (p: Purchase) => void;
  onEdit: (p: Purchase) => void;
  onDelete: (p: Purchase) => void;
}

// TZ-safe display via `formatBusinessDate`. Don't switch back to
// `new Intl.DateTimeFormat(...).format(new Date(stored))` — it shifts the
// day off-by-one in Canada / Maroc / any non-UTC TZ.
const DATE_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

export function PurchaseTable({ purchases, loading, onView, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-3 pb-2 font-medium">Date</th>
            <th className="px-3 pb-2 font-medium">Fournisseur</th>
            <th className="hidden px-3 pb-2 text-center font-medium md:table-cell">Lignes</th>
            <th className="hidden px-3 pb-2 text-right font-medium md:table-cell">HT</th>
            <th className="px-3 pb-2 text-right font-medium">Total TTC</th>
            <th className="px-3 pb-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : purchases.map((p) => {
                const subtotal = toNumber(p.subtotalHT);
                const total = toNumber(p.totalAmount);
                const grandTotal = p.invoiceGrandTotal ? toNumber(p.invoiceGrandTotal) : total;
                const hasAdditionalCosts = grandTotal > total;
                const itemsCount = p.items?.length ?? 0;
                const dateLabel = formatBusinessDate(p.purchaseDate, DATE_FORMAT_OPTS);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-border/40 transition-colors last:border-0 hover:bg-[var(--hover-overlay)]"
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {dateLabel}
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-3 font-medium" title={p.supplier?.name}>
                      {p.supplier?.name ?? '—'}
                    </td>
                    <td className="hidden px-3 py-3 text-center text-muted-foreground tabular-nums md:table-cell">
                      {itemsCount}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right text-muted-foreground tabular-nums md:table-cell">
                      {currency.format(subtotal)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">
                      {hasAdditionalCosts ? (
                        <span title={`Produits TTC : ${currency.format(total)} + Frais : ${currency.format(grandTotal - total)}`}>
                          {currency.format(grandTotal)}
                        </span>
                      ) : (
                        currency.format(total)
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onView(p)}
                          aria-label="Voir le détail"
                          title="Voir"
                          className="h-8 w-8"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(p)}
                          aria-label="Modifier"
                          title="Modifier"
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(p)}
                          aria-label="Supprimer"
                          title="Supprimer"
                          className="h-8 w-8 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
