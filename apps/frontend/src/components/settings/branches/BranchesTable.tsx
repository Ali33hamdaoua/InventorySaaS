import { Pencil, Power, PowerOff } from 'lucide-react';
import type { Branch } from '@/services/branches.service';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BranchStatusBadge } from './BranchStatusBadge';

interface Props {
  branches: Branch[];
  loading?: boolean;
  activeBranchId: string | null;
  onEdit: (branch: Branch) => void;
  onToggle: (branch: Branch) => void;
}

export function BranchesTable({ branches, loading, activeBranchId, onEdit, onToggle }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-3 pb-2 font-medium">Nom</th>
            <th className="px-3 pb-2 font-medium">Slug</th>
            <th className="px-3 pb-2 font-medium">Adresse</th>
            <th className="px-3 pb-2 text-right font-medium">Utilisateurs</th>
            <th className="px-3 pb-2 text-right font-medium">Produits</th>
            <th className="hidden px-3 pb-2 text-right font-medium md:table-cell">Achats</th>
            <th className="px-3 pb-2 font-medium">Statut</th>
            <th className="px-3 pb-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 2 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : branches.map((b) => {
                const isActiveSelection = activeBranchId === b.id;
                return (
                  <tr
                    key={b.id}
                    className="border-b border-border/40 transition-colors last:border-0 hover:bg-[var(--hover-overlay)]"
                  >
                    <td className="px-3 py-3 font-medium">{b.name}</td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{b.slug}</td>
                    <td
                      className="max-w-[260px] truncate px-3 py-3 text-muted-foreground"
                      title={b.address ?? '—'}
                    >
                      {b.address ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{b.usersCount ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{b.productsCount ?? 0}</td>
                    <td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">
                      {b.purchasesCount ?? 0}
                    </td>
                    <td className="px-3 py-3">
                      <BranchStatusBadge isActive={b.isActive} />
                      {isActiveSelection && (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-primary">
                          · active
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(b)}
                          aria-label="Modifier la succursale"
                          title="Modifier"
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onToggle(b)}
                          aria-label={b.isActive ? 'Désactiver' : 'Réactiver'}
                          title={b.isActive ? 'Désactiver' : 'Réactiver'}
                          className={
                            'h-8 w-8 ' +
                            (b.isActive ? 'hover:text-destructive' : 'hover:text-emerald-600')
                          }
                        >
                          {b.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
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
