import * as React from 'react';
import { Check, Loader2, Package, Scale, TriangleAlert } from 'lucide-react';
import { fromBaseUnits, hasPackaging, toBaseUnits } from '@inventorymdb/shared';
import type { InventoryLine } from '@/services/inventory-lines.service';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InventoryCriticalBadge } from './InventoryCriticalBadge';
import { currency, cn, toNumber, parseDecimalInput, formatNumber } from '@/lib/utils';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Permission, useHasPermission } from '@/lib/permissions';
import { CURRENCY } from '@/lib/brand';

/** data-attribute used by Enter-to-next-row keyboard navigation. */
const COUNT_INPUT_ATTR = 'data-count-idx';

function focusCountInput(idx: number): void {
  const el = document.querySelector<HTMLInputElement>(
    `input[${COUNT_INPUT_ATTR}="${idx}"]`,
  );
  if (el) {
    el.focus();
    el.select();
  }
}

/**
 * Editable draft for a single counting line. Only `closingQuantity` is
 * editable — opening qty, unit cost, purchases all come from the system
 * (previous period's closing, Product.defaultCost snapshot, PurchaseItems).
 *
 * Kept as a string so the user can type freely (partial input, decimal sep).
 */
export interface LineDraft {
  productId: string;
  closingQuantity: string;
}

/** Discrete per-row save indicator. Replaces the toast-per-save flood. */
export type LineSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  lines: InventoryLine[];
  drafts: Record<string, LineDraft>;
  /** Set of productIds whose draft differs from the server payload. */
  dirtyIds: Set<string>;
  onDraftChange: (productId: string, patch: Partial<LineDraft>) => void;
  /** Auto-save handler — invoked on Enter. Returns a promise that resolves
   *  once the row is persisted server-side, so the table can flip the row's
   *  status from `saving` to `saved`. */
  onLineSave?: (productId: string) => Promise<void>;
  /** Per-row status map (productId → status). Lets the table render a discrete
   *  indicator without spamming toasts on every keystroke. */
  saveStatuses?: Record<string, LineSaveStatus>;
  readOnly?: boolean;
  loading?: boolean;
  onTransferClick?: (line: InventoryLine) => void;
}

function SaveStatusCell({ status }: { status: LineSaveStatus }) {
  if (status === 'saving') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
        aria-live="polite"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Sauvegarde…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-emerald-400"
        aria-live="polite"
      >
        <Check className="h-3 w-3" />
        Sauvegardé
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-destructive"
        aria-live="polite"
        title="La sauvegarde de la ligne a échoué. Modifiez la valeur et appuyez à nouveau sur Entrée."
      >
        <TriangleAlert className="h-3 w-3" />
        Erreur
      </span>
    );
  }
  return null;
}

export const InventoryLinesTable = React.memo(function InventoryLinesTable({
  lines,
  drafts,
  dirtyIds,
  onDraftChange,
  onLineSave,
  saveStatuses,
  readOnly,
  loading,
  onTransferClick,
}: Props) {
  const canTransfer = useHasPermission(Permission.MANAGE_TRANSFERS);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card px-3 pb-2 font-medium">Produit</th>
            <th className="hidden px-3 pb-2 font-medium md:table-cell">Catégorie</th>
            <th className="px-3 pb-2 text-center font-medium">Unité</th>
            <th className="px-3 pb-2 text-right font-medium">Début qté</th>
            <th className="hidden px-3 pb-2 text-right font-medium lg:table-cell">Achats qté</th>
            <th className="px-3 pb-2 text-right font-medium" title="Transferts In - Transferts Out">Transferts qté</th>
            <th className="px-3 pb-2 text-right font-medium text-emerald-600 dark:text-emerald-400" title="Début + Achats + Transferts">Qté disponible</th>
            <th className="hidden px-3 pb-2 text-right font-medium lg:table-cell">Achats {CURRENCY.symbol}</th>
            <th className="px-3 pb-2 text-right font-medium text-primary">Fin qté (saisie)</th>
            <th
              className="px-3 pb-2 text-right font-medium"
              title="Coût moyen pondéré : Σ(qté × prix) / Σ(qté) sur tous les achats du produit ce mois-ci. Figé à la clôture."
            >
              Prix u.
            </th>
            <th className="px-3 pb-2 text-right font-medium">Valeur fin</th>
            <th className="px-3 pb-2 text-right font-medium">Consommation</th>
            <th className="px-3 pb-2 font-medium">Statut</th>
            {canTransfer && !readOnly && <th className="px-3 pb-2 font-medium text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {Array.from({ length: 13 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : lines.map((l, idx) => {
                const draft = drafts[l.productId];
                if (!draft) return null;
                const lastIdx = lines.length - 1;
                const dirty = dirtyIds.has(l.productId);
                const status: LineSaveStatus =
                  saveStatuses?.[l.productId] ?? 'idle';
                const openingQty = toNumber(l.openingQuantity);
                // V3 weighted-average cost — computed server-side from all
                // purchases of the product in this period (Σ qty×price / Σ qty).
                // For CLOSED periods this is the frozen snapshot from close
                // time. For OPEN, it's live.
                const unitCost = toNumber(l.unitCost);
                const openingValue = openingQty * unitCost;
                const purchasesValue = toNumber(l.purchasesValue);
                const closingQty = toNumber(draft.closingQuantity);
                const closingValue = closingQty * unitCost;
                const consumptionValue = openingValue + purchasesValue - closingValue;
                const minStock = toNumber(l.product.minStockLevel);
                const criticalLive = minStock > 0 && closingQty < minStock;
                return (
                  <tr
                    key={l.id}
                    className={cn(
                      'border-b border-border/40 transition-colors last:border-0',
                      dirty && 'bg-primary/[0.04]',
                    )}
                  >
                    <td
                      className="sticky left-0 z-10 max-w-[220px] bg-card px-3 py-2 font-medium"
                      title={l.product.name}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{l.product.name}</span>
                        {/* Contexte HISTORIQUE : la ligne reste visible même
                            si le produit a été désactivé après coup. Le badge
                            explicite le statut sans masquer aucune donnée. */}
                        {!l.product.isActive && (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] text-amber-500"
                            title="Produit désactivé — reste visible dans l'historique."
                          >
                            Inactif
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      {l.product.category ? (
                        <Badge variant="outline" className="text-[10px]">
                          {l.product.category.name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-xs text-muted-foreground">
                      {l.product.unit}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {openingQty}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground lg:table-cell">
                      {toNumber(l.purchasesQuantity)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {(() => {
                        const net = toNumber(l.transferInQuantity) - toNumber(l.transferOutQuantity);
                        if (net === 0) return '0';
                        return (
                          <span
                            className={cn(net > 0 ? 'text-emerald-500' : 'text-amber-500')}
                            title={`Entrées : ${toNumber(l.transferInQuantity)}\nSorties : ${toNumber(l.transferOutQuantity)}\nNet : ${net > 0 ? '+' : ''}${net}`}
                          >
                            {net > 0 ? '+' : ''}{net}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      {toNumber(l.availableQuantity)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground lg:table-cell">
                      {currency.format(purchasesValue)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <ClosingQtyInput
                          idx={idx}
                          line={l}
                          draft={draft}
                          dirty={dirty}
                          status={status}
                          criticalLive={criticalLive}
                          readOnly={readOnly}
                          lastIdx={lastIdx}
                          onDraftChange={onDraftChange}
                          onLineSave={onLineSave}
                        />
                        <SaveStatusCell status={status} />
                      </div>
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-3 py-2 text-right tabular-nums',
                        unitCost === 0
                          ? 'text-amber-400'
                          : 'text-muted-foreground',
                      )}
                      title={
                        unitCost === 0
                          ? 'Aucun achat ce mois-ci pour ce produit et pas de coût de référence. Saisissez un achat ou ouvrez Produits → modifier ce produit pour définir un coût par défaut.'
                          : 'Coût moyen pondéré calculé depuis les achats du mois (figé à la clôture).'
                      }
                    >
                      {currency.format(unitCost)}
                      {unitCost === 0 && (
                        <span className="ml-1 text-[10px] uppercase tracking-wider">
                          ⚠
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {currency.format(closingValue)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                      {currency.format(consumptionValue)}
                    </td>
                    <td className="px-3 py-2">
                      <InventoryCriticalBadge critical={criticalLive} />
                    </td>
                    {canTransfer && !readOnly && (
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          title="Transférer du stock"
                          onClick={() => onTransferClick?.(l)}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Sous-composant Fin qté — dual-input packaging si le produit est conditionné.
 *
 * Contrat (Règles 1 / 4 / 7) :
 *   - `draft.closingQuantity` reste TOUJOURS l'unité de base (string).
 *   - `onLineSave` déclenche l'auto-save de la ligne comme avant.
 *   - Navigation clavier Enter → ligne suivante : conservée strictement.
 *   - Produit sans packaging → un seul input, comportement historique inchangé.
 *
 * L'input « packagings » est numérique entier, les « unités » restantes
 * peuvent être décimales (ex : 2 cartons + 4.5 kg pour un packaging kg).
 * -------------------------------------------------------------------------- */

interface ClosingQtyInputProps {
  idx: number;
  line: InventoryLine;
  draft: LineDraft;
  dirty: boolean;
  status: LineSaveStatus;
  criticalLive: boolean;
  readOnly?: boolean;
  lastIdx: number;
  onDraftChange: (productId: string, patch: Partial<LineDraft>) => void;
  onLineSave?: (productId: string) => Promise<void>;
}

function ClosingQtyInput({
  idx,
  line,
  draft,
  dirty,
  status,
  criticalLive,
  readOnly,
  lastIdx,
  onDraftChange,
  onLineSave,
}: ClosingQtyInputProps) {
  const rawFactor = toNumber(line.product.packagingFactor);
  const pkgActive = hasPackaging(line.product.packagingName, rawFactor);
  const factor = pkgActive ? rawFactor : 0;
  const pkgName = line.product.packagingName ?? '';
  const unit = line.product.unit;

  // État UI local : évite que fromBaseUnits(floor) mange une saisie décimale
  // en cours dans le champ « unités ». Ressync depuis la base quand la source
  // externe change (nouvelle ligne, reset après save, etc.).
  const [pkgCountInput, setPkgCountInput] = React.useState('0');
  const [unitCountInput, setUnitCountInput] = React.useState(draft.closingQuantity);

  // Resync UI ↔ base uniquement quand l'IDENTITÉ change (nouvelle ligne
  // ou changement de facteur produit) — pas à chaque frappe, sinon
  // fromBaseUnits (qui floor) écraserait une saisie décimale partielle
  // comme "2." avant que l'utilisateur ait fini de taper.
  React.useEffect(() => {
    const qty = toNumber(draft.closingQuantity);
    if (pkgActive) {
      const { packagings, units } = fromBaseUnits(qty, factor);
      setPkgCountInput(String(packagings));
      setUnitCountInput(String(units));
    } else {
      setUnitCountInput(draft.closingQuantity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.productId, factor]);

  const commitBase = (base: number) => {
    onDraftChange(line.productId, { closingQuantity: String(base) });
  };

  const onPkgChange = (v: string) => {
    setPkgCountInput(v);
    const base = toBaseUnits(toNumber(v), toNumber(unitCountInput), factor);
    commitBase(base);
  };

  const onUnitsChange = (v: string) => {
    const sanitized = parseDecimalInput(v);
    setUnitCountInput(sanitized);
    if (pkgActive) {
      const base = toBaseUnits(toNumber(pkgCountInput), toNumber(sanitized), factor);
      commitBase(base);
    } else {
      // Produit unitaire : passthrough direct (comportement historique).
      onDraftChange(line.productId, { closingQuantity: sanitized });
    }
  };

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (onLineSave && dirty) {
      void onLineSave(line.productId);
    }
    if (idx < lastIdx) {
      focusCountInput(idx + 1);
    } else {
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  if (!pkgActive) {
    return (
      <Input
        type="text"
        inputMode="decimal"
        value={unitCountInput}
        onChange={(e) => onUnitsChange(e.target.value)}
        onKeyDown={handleEnter}
        disabled={readOnly}
        {...{ [COUNT_INPUT_ATTR]: idx }}
        className={cn(
          'h-8 w-24 text-right tabular-nums',
          criticalLive && 'border-destructive/40',
          dirty && 'border-primary/60',
          status === 'error' && 'border-destructive',
        )}
        aria-label={`Fin quantité ${line.product.name}`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/40 bg-background/40 p-1.5">
      <div className="flex items-center gap-1.5">
        <Package className="h-3 w-3 shrink-0 text-primary" />
        <Input
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={pkgCountInput}
          onChange={(e) => onPkgChange(e.target.value)}
          onKeyDown={handleEnter}
          disabled={readOnly}
          className={cn(
            'h-6 w-14 text-right tabular-nums',
            dirty && 'border-primary/60',
            status === 'error' && 'border-destructive',
          )}
          aria-label={`Nombre de ${pkgName} pour ${line.product.name}`}
          placeholder="0"
          title={`Nombre de ${pkgName}`}
        />
        <span className="w-8 text-[10px] font-medium text-muted-foreground">
          {pkgName}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Scale className="h-3 w-3 shrink-0 text-muted-foreground" />
        <Input
          type="text"
          inputMode="decimal"
          value={unitCountInput}
          onChange={(e) => onUnitsChange(e.target.value)}
          onKeyDown={handleEnter}
          disabled={readOnly}
          {...{ [COUNT_INPUT_ATTR]: idx }}
          className={cn(
            'h-6 w-14 text-right tabular-nums',
            criticalLive && 'border-destructive/40',
            dirty && 'border-primary/60',
            status === 'error' && 'border-destructive',
          )}
          aria-label={`Unités additionnelles (${unit}) pour ${line.product.name}`}
          placeholder="0"
          title={`Unités additionnelles (${unit})`}
        />
        <span className="w-8 text-[10px] font-medium text-muted-foreground">
          {unit}
        </span>
      </div>
      {/* Total mis en évidence — reste identique aux calculs (unité de base). */}
      <div className="mt-0.5 rounded bg-primary/[0.08] px-1.5 py-0.5 text-center text-[10px] font-semibold text-primary tabular-nums">
        = {formatNumber(toNumber(draft.closingQuantity), 2)} {unit}
      </div>
    </div>
  );
}
