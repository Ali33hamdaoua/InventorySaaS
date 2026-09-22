import { ArrowDown, ArrowUp, ArrowUpDown, Package, Pencil, Power, PowerOff, Trash2 } from 'lucide-react';
import type { Product, ProductSortField } from '@/services/products.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductStatusBadge } from './ProductStatusBadge';
import { currency, cn, toNumber } from '@/lib/utils';

interface Props {
  products: Product[];
  loading?: boolean;
  sortBy: ProductSortField;
  sortOrder: 'asc' | 'desc';
  onSortChange: (field: ProductSortField) => void;
  onEdit: (p: Product) => void;
  onToggleStatus: (p: Product) => void;
  /** Callback pour ouvrir le dialog de suppression physique. Fourni
   *  UNIQUEMENT quand l'utilisateur a le rôle OWNER/ADMIN — sinon le
   *  bouton reste caché. Le bouton lui-même n'apparaît que si le produit
   *  est inactif. */
  onHardDelete?: (p: Product) => void;
}

interface Col {
  key: ProductSortField | 'actions';
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right';
  className?: string;
}

const COLS: Col[] = [
  { key: 'name', label: 'Produit', sortable: true },
  { key: 'category', label: 'Catégorie', sortable: true, className: 'hidden lg:table-cell' },
  { key: 'supplier', label: 'Fournisseur', sortable: true, className: 'hidden xl:table-cell' },
  { key: 'defaultCost', label: 'Coût u.', sortable: true, align: 'right' },
  {
    key: 'minStockLevel',
    label: 'Seuil min',
    sortable: true,
    align: 'right',
    className: 'hidden md:table-cell',
  },
  { key: 'isActive', label: 'Statut', sortable: true },
  { key: 'actions', label: '', align: 'right' },
];

function SortIcon({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
  return order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

export function ProductTable({
  products,
  loading,
  sortBy,
  sortOrder,
  onSortChange,
  onEdit,
  onToggleStatus,
  onHardDelete,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {COLS.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-3 pb-2 font-medium',
                  c.align === 'right' && 'text-right',
                  c.className,
                )}
              >
                {c.sortable ? (
                  <button
                    onClick={() => onSortChange(c.key as ProductSortField)}
                    className={cn(
                      'inline-flex items-center gap-1.5 transition-colors hover:text-foreground',
                      sortBy === c.key && 'text-foreground',
                    )}
                  >
                    {c.label}
                    <SortIcon active={sortBy === c.key} order={sortOrder} />
                  </button>
                ) : (
                  <span className="sr-only">{c.label || 'Actions'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {COLS.map((c, j) => (
                    <td key={j} className={cn('px-3 py-3', c.className)}>
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : products.map((p) => {
                const cost = toNumber(p.defaultCost);
                const min = toNumber(p.minStockLevel);
                // Packaging visible sous le nom du produit s'il existe.
                // Non-invasif : les produits sans packaging n'affichent rien
                // de plus qu'avant (rétrocompat visuelle stricte).
                const pkgFactor = p.packagingFactor ? toNumber(p.packagingFactor) : 0;
                const hasPkg = !!p.packagingName && pkgFactor > 0;
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      'border-b border-border/40 transition-colors last:border-0 hover:bg-white/[0.02]',
                      !p.isActive && 'opacity-60',
                    )}
                  >
                    <td className="max-w-[260px] px-3 py-3 font-medium" title={p.name}>
                      <div className="truncate">{p.name}</div>
                      {hasPkg && (
                        <div
                          className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-normal"
                          title={`1 ${p.packagingName} = ${pkgFactor} ${p.unit}`}
                        >
                          <Package className="h-3 w-3 text-primary" />
                          <span className="font-medium text-foreground">
                            {p.packagingName}
                          </span>
                          <span className="text-muted-foreground">
                            · {pkgFactor} {p.unit}/{p.packagingName!.toLowerCase()}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      {p.category ? (
                        <Badge variant="outline">{p.category.name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className="hidden max-w-[180px] truncate px-3 py-3 xl:table-cell"
                      title={p.supplier?.name}
                    >
                      {p.supplier ? (
                        <span className="text-sm">
                          {p.supplier.name}
                          {!p.supplier.isActive && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (inactif)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">Non assigné</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      <div>{currency.format(cost)}</div>
                      <div className="text-[11px] text-muted-foreground">/ {p.unit}</div>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums md:table-cell">
                      {min > 0 ? (
                        <span>
                          {min} <span className="text-[11px] text-muted-foreground">{p.unit}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <ProductStatusBadge isActive={p.isActive} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(p)}
                          className="gap-1.5"
                          aria-label={`Modifier ${p.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Modifier</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onToggleStatus(p)}
                          className={cn(
                            'gap-1.5',
                            p.isActive ? 'hover:text-destructive' : 'hover:text-emerald-400',
                          )}
                          aria-label={p.isActive ? `Désactiver ${p.name}` : `Réactiver ${p.name}`}
                        >
                          {p.isActive ? (
                            <PowerOff className="h-3.5 w-3.5" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">
                            {p.isActive ? 'Désactiver' : 'Réactiver'}
                          </span>
                        </Button>
                        {/* Bouton suppression PHYSIQUE : visible uniquement
                            pour un produit inactif ET quand l'appelant a
                            fourni un handler (⇔ rôle OWNER/ADMIN).
                            Le backend renverra 409 si le produit a un
                            historique — c'est le dialog qui gère l'UX. */}
                        {onHardDelete && !p.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onHardDelete(p)}
                            className="gap-1.5 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Supprimer définitivement ${p.name}`}
                            title="Supprimer définitivement (uniquement si aucun historique)"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Supprimer</span>
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
