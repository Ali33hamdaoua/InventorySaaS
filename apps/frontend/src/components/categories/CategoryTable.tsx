import { Pencil, Power, PowerOff, Package } from 'lucide-react';
import type { Category } from '@/services/categories.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryTypeBadge } from './CategoryTypeBadge';
import { CategoryStatusBadge } from './CategoryStatusBadge';
import { cn } from '@/lib/utils';

interface Props {
  categories: Category[];
  loading?: boolean;
  onEdit: (c: Category) => void;
  onToggleStatus: (c: Category) => void;
}

export function CategoryTable({ categories, loading, onEdit, onToggleStatus }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-3 pb-2 font-medium">Nom</th>
            <th className="hidden px-3 pb-2 font-medium md:table-cell">Description</th>
            <th className="px-3 pb-2 font-medium">Type</th>
            <th className="px-3 pb-2 font-medium">Produits</th>
            <th className="px-3 pb-2 font-medium">Statut</th>
            <th className="px-3 pb-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : categories.map((c) => (
                <tr
                  key={c.id}
                  className={cn(
                    'border-b border-border/40 transition-colors last:border-0 hover:bg-white/[0.02]',
                    !c.isActive && 'opacity-60',
                  )}
                >
                  <td className="max-w-[260px] truncate px-3 py-3 font-medium" title={c.name}>
                    {c.name}
                  </td>
                  <td className="hidden max-w-[420px] truncate px-3 py-3 text-muted-foreground md:table-cell">
                    {c.description ?? '—'}
                  </td>
                  <td className="px-3 py-3">
                    <CategoryTypeBadge type={c.categoryType} />
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline" className="gap-1">
                      <Package className="h-3 w-3" />
                      {c.productCount ?? 0}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <CategoryStatusBadge isActive={c.isActive} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(c)}
                        className="gap-1.5"
                        aria-label={`Modifier ${c.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Modifier</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleStatus(c)}
                        className={cn(
                          'gap-1.5',
                          c.isActive ? 'hover:text-destructive' : 'hover:text-emerald-400',
                        )}
                        aria-label={c.isActive ? `Désactiver ${c.name}` : `Réactiver ${c.name}`}
                      >
                        {c.isActive ? (
                          <PowerOff className="h-3.5 w-3.5" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">
                          {c.isActive ? 'Désactiver' : 'Réactiver'}
                        </span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
