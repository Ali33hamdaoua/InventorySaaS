import { Building2, Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { useBranchStore } from '@/stores/branch.store';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

export function BranchSwitcher() {
  const { branch, branches, isLoading, isError } = useActiveBranch();
  const setSelectedBranch = useBranchStore((s) => s.setSelectedBranch);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary px-3 py-1.5">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  if (isError || branches.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-200"
        title="Aucune succursale disponible"
      >
        <Building2 className="h-3.5 w-3.5" />
        <span>Aucune succursale</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'group inline-flex items-center gap-2 rounded-md border border-border/60 bg-secondary px-3 py-1.5 text-xs transition-colors',
            'hover:border-primary/40 hover:bg-muted',
          )}
          aria-label="Changer de succursale"
        >
          <Building2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Succursale
          </span>
          <span className="font-medium text-foreground">{branch?.name ?? '—'}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {BRAND.name} · sites
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((b) => {
          const isActive = b.id === branch?.id;
          return (
            <DropdownMenuItem
              key={b.id}
              onSelect={() =>
                setSelectedBranch({ id: b.id, slug: b.slug, name: b.name })
              }
              className={cn(
                'flex items-center justify-between gap-2',
                isActive && 'bg-primary/10 text-primary',
              )}
            >
              <span className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5" />
                <span>{b.name}</span>
                <span className="text-[10px] text-muted-foreground">/{b.slug}</span>
              </span>
              {isActive && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
