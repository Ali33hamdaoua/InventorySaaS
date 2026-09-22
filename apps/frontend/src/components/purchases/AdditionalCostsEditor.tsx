import { useEffect, useRef } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import {
  PURCHASE_ADDITIONAL_COST_LABEL,
  PurchaseAdditionalCostType,
  sumTaxes,
  TPS_RATE,
  TVQ_RATE,
} from '@inventorymdb/shared';
import type { AccountingCategory } from '@/services/accounting-categories.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { currency, toNumber } from '@/lib/utils';

/** Draft d'un frais supplémentaire dans le formulaire. Strings pour saisie
 *  libre (comme le pattern des items produits) — parsées à l'envoi. */
export interface AdditionalCostDraft {
  costType: string;
  description: string;
  accountingCategoryId: string;
  amountBeforeTax: string;
  tpsAmount: string;
  tvqAmount: string;
}

interface Props {
  drafts: AdditionalCostDraft[];
  accountingCategories: AccountingCategory[];
  onChange: (next: AdditionalCostDraft[]) => void;
}

const emptyDraft: AdditionalCostDraft = {
  costType: PurchaseAdditionalCostType.ESSENCE,
  description: '',
  accountingCategoryId: '',
  amountBeforeTax: '0',
  tpsAmount: '0',
  tvqAmount: '0',
};

const COST_TYPE_OPTIONS = Object.entries(PURCHASE_ADDITIONAL_COST_LABEL) as Array<
  [string, string]
>;

/**
 * Éditeur compact de frais supplémentaires.
 *
 * Contrat métier (V1) :
 *   - Aucune modification des produits ni du WAC.
 *   - Une ligne = un frais = une future ligne comptable HT/TPS/TVQ/TTC
 *     avec `sourceType=PURCHASE_ADDITIONAL_COST` incluse dans le rapport
 *     financier (en HT via la mécanique LOT 2).
 */
export function AdditionalCostsEditor({
  drafts,
  accountingCategories,
  onChange,
}: Props) {
  const activeCategories = accountingCategories.filter((c) => c.isActive);
  // Track du dernier ajout pour auto-scroller la nouvelle ligne dans la vue.
  const lastAddedCountRef = useRef(drafts.length);
  const lastRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Scroll UNIQUEMENT quand une ligne vient d'être ajoutée (pas sur
    // suppression ni sur update). Petit délai pour laisser le DOM se
    // stabiliser puis on centre la ligne dans le scroll container parent.
    if (drafts.length > lastAddedCountRef.current && lastRowRef.current) {
      lastRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      // Focus sur le champ montant HT — c'est celui à remplir en premier.
      const htInput = lastRowRef.current.querySelector<HTMLInputElement>(
        'input[type="number"][step="0.01"]',
      );
      htInput?.focus();
    }
    lastAddedCountRef.current = drafts.length;
  }, [drafts.length]);

  const updateDraft = (idx: number, patch: Partial<AdditionalCostDraft>) => {
    onChange(drafts.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };
  const addDraft = () => onChange([...drafts, { ...emptyDraft }]);
  const removeDraft = (idx: number) => onChange(drafts.filter((_, i) => i !== idx));

  // Total HT + TTC de tous les frais (aide visuelle)
  const totals = drafts.reduce(
    (acc, d) => {
      const ht = toNumber(d.amountBeforeTax);
      const tps = toNumber(d.tpsAmount);
      const tvq = toNumber(d.tvqAmount);
      const total = sumTaxes(ht, tps, tvq).total;
      return {
        ht: acc.ht + ht,
        total: acc.total + total,
      };
    },
    { ht: 0, total: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Frais supplémentaires (optionnel)</Label>
        <Button type="button" variant="outline" size="sm" onClick={addDraft} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Ajouter un frais
        </Button>
      </div>

      {drafts.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/40 bg-background/30 px-3 py-2 text-center text-[11px] text-muted-foreground">
          Aucun frais. Ajoutez de l'essence, de la livraison, un péage, etc. si
          la facture en contient.
        </p>
      ) : (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
          {drafts.map((d, idx) => {
            const ht = toNumber(d.amountBeforeTax);
            const tps = toNumber(d.tpsAmount);
            const tvq = toNumber(d.tvqAmount);
            const total = sumTaxes(ht, tps, tvq).total;
            const suggestTps = () =>
              updateDraft(idx, { tpsAmount: (ht * TPS_RATE).toFixed(2) });
            const suggestTvq = () =>
              updateDraft(idx, { tvqAmount: (ht * TVQ_RATE).toFixed(2) });

            const isLast = idx === drafts.length - 1;
            return (
              <div
                key={idx}
                ref={isLast ? lastRowRef : undefined}
                className="grid grid-cols-1 gap-2 rounded-md border border-border/40 bg-background/40 p-2 md:grid-cols-[140px_1fr_140px_100px_100px_100px_80px_32px] md:items-end"
              >
                {/* Type */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Type
                  </Label>
                  <Select
                    value={d.costType}
                    onValueChange={(v) => updateDraft(idx, { costType: v })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_TYPE_OPTIONS.map(([code, label]) => (
                        <SelectItem key={code} value={code}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Description (optionnel)
                  </Label>
                  <Input
                    value={d.description}
                    onChange={(e) => updateDraft(idx, { description: e.target.value })}
                    placeholder="Ex : Déplacement marché central"
                    maxLength={500}
                    className="h-8"
                  />
                </div>

                {/* Catégorie comptable */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Catégorie compta
                  </Label>
                  <Select
                    value={d.accountingCategoryId || undefined}
                    onValueChange={(v) => updateDraft(idx, { accountingCategoryId: v })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Choisir…" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* HT */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    HT
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={d.amountBeforeTax}
                    onChange={(e) => updateDraft(idx, { amountBeforeTax: e.target.value })}
                    className="h-8 text-right tabular-nums"
                  />
                </div>

                {/* TPS avec bouton auto */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    TPS
                  </Label>
                  <div className="flex items-center gap-0.5">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={d.tpsAmount}
                      onChange={(e) => updateDraft(idx, { tpsAmount: e.target.value })}
                      className="h-8 text-right tabular-nums"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={suggestTps}
                      title="5 % du HT"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                    >
                      <Wand2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* TVQ avec bouton auto */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    TVQ
                  </Label>
                  <div className="flex items-center gap-0.5">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={d.tvqAmount}
                      onChange={(e) => updateDraft(idx, { tvqAmount: e.target.value })}
                      className="h-8 text-right tabular-nums"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={suggestTvq}
                      title="9,975 % du HT"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                    >
                      <Wand2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Total TTC (readonly) */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    TTC
                  </Label>
                  <div className="rounded-md bg-primary/[0.08] px-2 py-1.5 text-right text-xs font-semibold text-primary tabular-nums">
                    {currency.format(total)}
                  </div>
                </div>

                {/* Supprimer */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeDraft(idx)}
                  aria-label={`Supprimer le frais ${idx + 1}`}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}

          {/* Totaux consolidés */}
          <div className="flex items-center justify-between gap-6 border-t border-border/60 pt-2 text-xs">
            <span className="text-muted-foreground">
              Total frais HT :{' '}
              <strong className="text-foreground tabular-nums">
                {currency.format(totals.ht)}
              </strong>
            </span>
            <span className="text-muted-foreground">
              Total frais TTC :{' '}
              <strong className="text-foreground tabular-nums">
                {currency.format(totals.total)}
              </strong>
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Les frais supplémentaires n'affectent pas le prix des produits ni le
            WAC. Chaque frais devient une dépense comptable HT dans le rapport
            financier.
          </p>
        </div>
      )}
    </div>
  );
}
