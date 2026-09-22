import { useState, type ReactNode } from 'react';
import { ChevronDown, ListFilter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  /** Always-visible right side, e.g. "5 produits". */
  totalLabel: ReactNode;
  /** Number of currently active filter fields (drives the badge + auto-open). */
  activeCount: number;
  /** When true, shows the "Réinitialiser" button + auto-opens the panel on mount. */
  isDirty: boolean;
  onReset: () => void;
  /** The filter inputs themselves — rendered only when open. */
  children: ReactNode;
  /** Initial open state on first mount. Defaults to false (collapsed). */
  defaultOpen?: boolean;
}

/**
 * Header bar with a clickable "Filtres" button. The field grid is hidden by
 * default and revealed when the user clicks the button — keeps list pages
 * uncluttered when the user just wants to browse.
 *
 * If the page lands with active filters already applied (e.g. coming back from
 * a deep link), the panel auto-opens once on first mount so the user can see
 * what's filtered.
 */
export function CollapsibleFilters({
  totalLabel,
  activeCount,
  isDirty,
  onReset,
  children,
  defaultOpen,
}: Props) {
  const [open, setOpen] = useState<boolean>(defaultOpen ?? isDirty);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="collapsible-filters-body"
          className={cn(
            'group inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] transition-colors',
            open || isDirty
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          <ListFilter className="h-3.5 w-3.5" />
          <span>Filtres</span>
          {activeCount > 0 && (
            <span
              className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
              aria-label={`${activeCount} filtre(s) actif(s)`}
            >
              {activeCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              open ? 'rotate-180' : 'rotate-0',
            )}
          />
        </button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">{totalLabel}</span>
          {isDirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-7 gap-1 px-2"
            >
              <X className="h-3.5 w-3.5" />
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div id="collapsible-filters-body" className="space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
