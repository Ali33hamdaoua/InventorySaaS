import { Mail, Phone, Pencil, Power, PowerOff, ShoppingCart } from 'lucide-react';
import type { Supplier } from '@/services/suppliers.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SupplierStatusBadge } from './SupplierStatusBadge';
import { currency, cn, toNumber, formatBusinessDate } from '@/lib/utils';

interface Props {
  suppliers: Supplier[];
  loading?: boolean;
  onEdit: (s: Supplier) => void;
  onToggleStatus: (s: Supplier) => void;
}

const DATE_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

export function SupplierTable({ suppliers, loading, onEdit, onToggleStatus }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-3 pb-2 font-medium">Fournisseur</th>
            <th className="hidden px-3 pb-2 font-medium md:table-cell">Contact</th>
            <th className="hidden px-3 pb-2 font-medium lg:table-cell">Coordonnées</th>
            <th className="px-3 pb-2 text-right font-medium">Achats</th>
            <th className="hidden px-3 pb-2 font-medium md:table-cell">Dernier achat</th>
            <th className="px-3 pb-2 font-medium">Statut</th>
            <th className="px-3 pb-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : suppliers.map((s) => {
                const total = toNumber(s.totalPurchasedAmount);
                const count = s.purchasesCount ?? 0;
                const lastLabel = s.lastPurchaseDate
                  ? formatBusinessDate(s.lastPurchaseDate, DATE_FORMAT_OPTS)
                  : null;
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      'border-b border-border/40 transition-colors last:border-0 hover:bg-white/[0.02]',
                      !s.isActive && 'opacity-60',
                    )}
                  >
                    <td className="max-w-[260px] truncate px-3 py-3 font-medium" title={s.name}>
                      {s.name}
                      {s.address && (
                        <div className="truncate text-[11px] font-normal text-muted-foreground">
                          {s.address}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                      {s.contactName ?? '—'}
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      <div className="space-y-0.5 text-xs">
                        {s.email && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span className="truncate" title={s.email}>
                              {s.email}
                            </span>
                          </div>
                        )}
                        {s.phone && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{s.phone}</span>
                          </div>
                        )}
                        {!s.email && !s.phone && <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      <div className="font-medium">{currency.format(total)}</div>
                      <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                        <ShoppingCart className="h-3 w-3" />
                        {count} achat{count > 1 ? 's' : ''}
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-xs text-muted-foreground md:table-cell">
                      {lastLabel ? (
                        lastLabel
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Jamais
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <SupplierStatusBadge isActive={s.isActive} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(s)}
                          className="gap-1.5"
                          aria-label={`Modifier ${s.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Modifier</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onToggleStatus(s)}
                          className={cn(
                            'gap-1.5',
                            s.isActive ? 'hover:text-destructive' : 'hover:text-emerald-400',
                          )}
                          aria-label={s.isActive ? `Désactiver ${s.name}` : `Réactiver ${s.name}`}
                        >
                          {s.isActive ? (
                            <PowerOff className="h-3.5 w-3.5" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">
                            {s.isActive ? 'Désactiver' : 'Réactiver'}
                          </span>
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
