import { Pencil, Trash2, ShoppingCart, Eye, Wrench } from 'lucide-react';
import { PAYMENT_METHOD_LABEL_FR } from '@/lib/accounting-options';
import type { AccountingExpense } from '@/services/accounting.service';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { currency, toNumber, cn, formatBusinessDate } from '@/lib/utils';

interface Props {
  expenses: AccountingExpense[];
  loading?: boolean;
  onEdit: (expense: AccountingExpense) => void;
  onDelete: (expense: AccountingExpense) => void;
  /** Called with the source purchaseId when the user clicks the eye on an
   *  auto-generated row (PURCHASE source). Optional — if omitted the
   *  eye button is hidden. */
  onViewPurchase?: (purchaseId: string) => void;
  /** Navigate to the source RepairEntry page. Optional. */
  onViewRepair?: (repairId: string) => void;
}

// Date format options reused by every row. We pass them through
// `formatBusinessDate` (timezone-safe) instead of formatting via
// `Intl.DateTimeFormat.format(new Date(stored))` which shifts the day
// in non-UTC timezones (the bug that made 02 juin show as 01 juin).
const DATE_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

/**
 * Per-source visual hint: icon + badge label + tooltip.
 *
 * Note: `LABOR` exists in the AccountingSourceType enum for backwards-compat
 * (previous version mirrored LaborEntry into AccountingExpense) but no row
 * with sourceType=LABOR should ever exist now — the cleanup migration purged
 * them and labor.service.ts no longer writes them. If a stray one slips
 * through (manual SQL insert, rollback), it falls through to the default
 * "Manuel" rendering, which is harmless.
 */
function sourceMeta(e: AccountingExpense): {
  isAuto: boolean;
  icon: typeof ShoppingCart | null;
  label: string;
  tooltip: string;
} {
  switch (e.sourceType) {
    case 'PURCHASE':
      return {
        isAuto: true,
        icon: ShoppingCart,
        label: 'Achat fournisseur',
        tooltip:
          "Ligne générée automatiquement depuis un achat fournisseur. Modifiez l'achat source pour la mettre à jour.",
      };
    case 'REPAIR':
      return {
        isAuto: true,
        icon: Wrench,
        label: 'Réparation',
        tooltip:
          'Cette dépense vient du module Réparations. Modifiez la réparation source pour changer le montant.',
      };
    default:
      return {
        isAuto: false,
        icon: null,
        label: 'Manuel',
        tooltip: 'Dépense saisie manuellement — entièrement modifiable.',
      };
  }
}

export function AccountingExpensesTable({
  expenses,
  loading,
  onEdit,
  onDelete,
  onViewPurchase,
  onViewRepair,
}: Props) {
  return (
    <div className="overflow-x-auto">
      {/* Explicit min-width keeps prices readable on smaller screens — the
          container scrolls horizontally if needed instead of crushing every
          column and breaking "TOTAL TTC" across two lines. */}
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="whitespace-nowrap px-3 pb-2 font-medium">Date</th>
            <th className="whitespace-nowrap px-3 pb-2 font-medium">Source</th>
            <th className="whitespace-nowrap px-3 pb-2 font-medium">Catégorie</th>
            <th className="whitespace-nowrap px-3 pb-2 font-medium">Fournisseur</th>
            <th className="px-3 pb-2 font-medium">Description</th>
            <th className="whitespace-nowrap px-3 pb-2 text-right font-medium">Montant</th>
            <th className="hidden whitespace-nowrap px-3 pb-2 font-medium lg:table-cell">
              Paiement
            </th>
            <th className="whitespace-nowrap px-3 pb-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {Array.from({ length: 11 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : expenses.map((e) => {
                const dateLabel = formatBusinessDate(e.expenseDate, DATE_FORMAT_OPTS);
                const total = toNumber(e.totalAmount);
                const supplierLabel = e.supplier?.name ?? e.supplierName ?? '—';
                const meta = sourceMeta(e);
                const SourceIcon = meta.icon;
                return (
                  <tr
                    key={e.id}
                    className={cn(
                      'group border-b border-border/40 transition-colors last:border-0 hover:bg-white/[0.02]',
                      // Subtle background tint on auto rows. The left gutter
                      // indicator lives on the first cell as an inset
                      // box-shadow (see below) — NEVER use position:relative +
                      // before:absolute on <tr>, that misaligns columns in
                      // table rendering.
                      meta.isAuto && 'bg-primary/[0.025]',
                    )}
                  >
                    <td
                      className={cn(
                        'whitespace-nowrap px-3 py-3 text-muted-foreground',
                        // Inset box-shadow = visual-only "gutter" on auto
                        // rows. Takes zero layout space so columns stay
                        // perfectly aligned with manual rows above/below.
                        meta.isAuto && 'shadow-[inset_3px_0_0_0] shadow-primary',
                      )}
                    >
                      {dateLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {meta.isAuto && SourceIcon ? (
                        <Badge
                          className="gap-1.5 border-transparent bg-primary/15 text-primary hover:bg-primary/20"
                          title={meta.tooltip}
                        >
                          <SourceIcon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="font-normal text-muted-foreground"
                          title={meta.tooltip}
                        >
                          {meta.label}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="whitespace-nowrap font-normal">
                        {/* Real category name (dynamic). Falls back to "—" if
                            the row pre-dates the migration and never got
                            backfilled — defensive only. */}
                        {e.categoryName ?? '—'}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3" title={supplierLabel}>
                      <span className="block max-w-[140px] truncate">{supplierLabel}</span>
                    </td>
                    <td
                      className="px-3 py-3 text-foreground/80"
                      title={e.description}
                    >
                      <span className="block max-w-[220px] truncate">
                        {e.description}
                        {e.referenceNumber && (
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {e.referenceNumber}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">
                      {currency.format(total)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-muted-foreground lg:table-cell">
                      {e.paymentMethod ? PAYMENT_METHOD_LABEL_FR[e.paymentMethod] : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {meta.isAuto ? (
                          <AutoRowAction
                            expense={e}
                            dateLabel={dateLabel}
                            onEdit={onEdit}
                            onViewPurchase={onViewPurchase}
                            onViewRepair={onViewRepair}
                          />
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onEdit(e)}
                              aria-label={`Modifier la dépense du ${dateLabel}`}
                              title="Modifier"
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onDelete(e)}
                              aria-label="Supprimer la dépense"
                              title="Supprimer"
                              className="h-8 w-8 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
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

/**
 * Action button for auto-synced rows: a single "Voir la source" link that
 * routes to whichever module owns the row, plus an "Éditer note" affordance.
 * Numeric fields stay locked — the backend rejects edits to them and the
 * frontend mirrors that constraint by simply not exposing the form.
 */
function AutoRowAction({
  expense,
  dateLabel,
  onEdit,
  onViewPurchase,
  onViewRepair,
}: {
  expense: AccountingExpense;
  dateLabel: string;
  onEdit: (e: AccountingExpense) => void;
  onViewPurchase?: (purchaseId: string) => void;
  onViewRepair?: (repairId: string) => void;
}) {
  const handleView = () => {
    if (expense.sourceType === 'PURCHASE' && expense.purchaseId) {
      onViewPurchase?.(expense.purchaseId);
    } else if (expense.sourceType === 'REPAIR' && expense.repairId) {
      onViewRepair?.(expense.repairId);
    }
  };
  const viewLabel =
    expense.sourceType === 'PURCHASE' ? 'Voir l\'achat' : 'Voir la réparation';
  const hasHandler =
    (expense.sourceType === 'PURCHASE' && !!onViewPurchase && !!expense.purchaseId) ||
    (expense.sourceType === 'REPAIR' && !!onViewRepair && !!expense.repairId);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={!hasHandler}
        onClick={handleView}
        aria-label="Voir la source"
        title="Voir la source de la dépense"
        className={cn(
          'h-8 shrink-0 gap-1.5 whitespace-nowrap rounded-full border border-primary/30 px-3 text-[11px] font-medium text-primary',
          'transition-colors hover:bg-primary/10 hover:text-primary',
          'disabled:opacity-50',
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        {viewLabel}
      </Button>
      {/* Notes-only edit — the backend accepts a `notes` patch on auto rows.
          Lets the accountant add a comment without touching the amounts. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onEdit(expense)}
        aria-label={`Modifier la note du ${dateLabel}`}
        title="Modifier la note (les montants viennent du module source)"
        className="h-8 w-8"
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </>
  );
}
