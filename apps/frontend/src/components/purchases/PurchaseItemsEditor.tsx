import { useEffect, useState } from 'react';
import { Package, Plus, Scale, Trash2 } from 'lucide-react';
import {
  calculatePurchaseTotals,
  fromBaseUnits,
  hasPackaging,
  toBaseUnits,
} from '@inventorymdb/shared';
import type { Product } from '@/services/products.service';
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
import { currency, formatNumber, toNumber } from '@/lib/utils';
import { CURRENCY } from '@/lib/brand';

export interface DraftItem {
  productId: string;
  quantity: string;
  unitPrice: string;
}

interface Props {
  items: DraftItem[];
  products: Product[];
  onChange: (next: DraftItem[]) => void;
  /** Manual-entry tax values (parent owns the state, this editor just renders). */
  /** Optional error message displayed under the items block. */
  error?: string;
}

const emptyItem: DraftItem = { productId: '', quantity: '1', unitPrice: '0' };

function lineTotal(item: DraftItem): number {
  return toNumber(item.quantity) * toNumber(item.unitPrice);
}

export function PurchaseItemsEditor({
  items,
  products,
  onChange,
  error,
}: Props) {
  // Authoritative live preview — same helper the backend uses before persist.
  const totals = calculatePurchaseTotals(
    items.map((i) => ({
      quantity: toNumber(i.quantity),
      unitPrice: toNumber(i.unitPrice),
    })),
  );

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  /**
   * When a product is selected, auto-fill the unit price from its
   * `defaultCost`. Kills the original "total = 0" UX bug.
   */
  const onProductChange = (idx: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    const patch: Partial<DraftItem> = { productId };
    if (product) {
      patch.unitPrice = String(toNumber(product.defaultCost));
    }
    updateItem(idx, patch);
  };

  const removeItem = (idx: number) => {
    if (items.length === 1) {
      onChange([{ ...emptyItem }]);
      return;
    }
    onChange(items.filter((_, i) => i !== idx));
  };

  const addItem = () => onChange([...items, { ...emptyItem }]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Lignes produits</Label>
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Ajouter une ligne
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Aucune ligne. Cliquez sur « Ajouter une ligne » pour commencer.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_120px_140px_120px_40px] gap-2 px-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground md:grid">
              <span>Produit</span>
              <span className="text-right">Quantité</span>
              <span className="text-right">Prix unitaire</span>
              <span className="text-right">Total ligne</span>
              <span />
            </div>

            {items.map((item, idx) => {
              const product = products.find((p) => p.id === item.productId) ?? null;
              return (
                <LineRow
                  key={idx}
                  idx={idx}
                  item={item}
                  product={product}
                  products={products}
                  total={lineTotal(item)}
                  onProductChange={(v) => onProductChange(idx, v)}
                  onQuantityChange={(v) => updateItem(idx, { quantity: v })}
                  onUnitPriceChange={(v) => updateItem(idx, { unitPrice: v })}
                  onRemove={() => removeItem(idx)}
                />
              );
            })}
          </div>
        )}

        {/* Totals — derived entirely from the item lines (no sales tax). */}
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between border-t border-border/40 pt-2">
            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Total
            </span>
            <span className="text-lg font-semibold tabular-nums text-primary">
              {currency.format(totals.total)}
            </span>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sous-composant ligne — encapsule l'affichage packaging vs unitaire.        */
/*                                                                            */
/* Contrat (Règles 1 / 4 / 7) :                                               */
/*   - Le DraftItem sortant conserve `quantity` en UNITÉ DE BASE.             */
/*   - Le `unitPrice` reste TOUJOURS le prix par unité de base.               */
/*   - Les inputs "nb packagings / nb unités" et "prix par packaging" sont    */
/*     du sucre UI local : ils écrivent dans les champs autoritatifs via le   */
/*     helper partagé toBaseUnits() / fromBaseUnits().                        */
/*   - Produit sans packaging → interface strictement identique à avant.      */
/* -------------------------------------------------------------------------- */

interface LineRowProps {
  idx: number;
  item: DraftItem;
  product: Product | null;
  products: Product[];
  total: number;
  onProductChange: (productId: string) => void;
  onQuantityChange: (q: string) => void;
  onUnitPriceChange: (p: string) => void;
  onRemove: () => void;
}

function LineRow({
  idx,
  item,
  product,
  products,
  total,
  onProductChange,
  onQuantityChange,
  onUnitPriceChange,
  onRemove,
}: LineRowProps) {
  // packagingFactor arrive en string (Decimal(14,4) wire) → convertir avant
  // d'appeler le helper partagé, qui attend un number.
  const rawFactor = product ? toNumber(product.packagingFactor) : 0;
  const pkgActive = !!product && hasPackaging(product.packagingName, rawFactor);
  const factor = pkgActive ? rawFactor : 0;
  const pkgName = product?.packagingName ?? '';
  const unit = product?.unit ?? '';

  // État local UI-seul pour éviter que fromBaseUnits(floor) mange la saisie
  // en cours. Synchronisé depuis `quantity` (unité de base) quand la source
  // externe change (changement produit, remove, reset externe).
  const [pkgCountInput, setPkgCountInput] = useState('0');
  const [unitCountInput, setUnitCountInput] = useState(item.quantity);
  const [pkgPriceInput, setPkgPriceInput] = useState('0');

  useEffect(() => {
    const qty = toNumber(item.quantity);
    if (pkgActive) {
      const { packagings, units } = fromBaseUnits(qty, factor);
      setPkgCountInput(String(packagings));
      setUnitCountInput(String(units));
    } else {
      setUnitCountInput(item.quantity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.productId, factor]);

  // Prix par packaging affiché avec 2 décimales lisibles.
  // Précision complète conservée pour item.unitPrice côté source de vérité.
  useEffect(() => {
    if (pkgActive) {
      setPkgPriceInput((toNumber(item.unitPrice) * factor).toFixed(2));
    }
  }, [item.unitPrice, factor, pkgActive]);

  const onPkgCountChange = (v: string) => {
    setPkgCountInput(v);
    const base = toBaseUnits(toNumber(v), toNumber(unitCountInput), factor);
    onQuantityChange(String(base));
  };

  const onUnitCountChange = (v: string) => {
    setUnitCountInput(v);
    if (pkgActive) {
      const base = toBaseUnits(toNumber(pkgCountInput), toNumber(v), factor);
      onQuantityChange(String(base));
    } else {
      // Produit unitaire : cet input EST la quantité — passthrough direct
      // (comportement historique strictement inchangé).
      onQuantityChange(v);
    }
  };

  const onPkgPriceChange = (v: string) => {
    setPkgPriceInput(v);
    if (factor > 0) {
      // Prix par unité de base = prix par packaging / factor. On limite à
      // 4 décimales (précision Decimal(14,4) DB) — précision complète
      // gardée, mais on évite les artefacts flottants (1.666666666...).
      const unitPrice = toNumber(v) / factor;
      onUnitPriceChange(parseFloat(unitPrice.toFixed(4)).toString());
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_140px_120px_40px] md:items-start">
      <Select value={item.productId || undefined} onValueChange={onProductChange}>
        <SelectTrigger aria-label={`Produit ligne ${idx + 1}`}>
          <SelectValue placeholder="Sélectionner un produit…" />
        </SelectTrigger>
        <SelectContent>
          {products.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}{' '}
              <span className="text-xs text-muted-foreground">({p.unit})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {pkgActive ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-border/40 bg-background/60 p-1.5">
          <div className="flex items-center gap-1.5">
            <Package className="h-3 w-3 shrink-0 text-primary" />
            <Input
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              value={pkgCountInput}
              onChange={(e) => onPkgCountChange(e.target.value)}
              className="h-7 text-right tabular-nums"
              aria-label={`Nombre de ${pkgName}`}
              placeholder="0"
              title={`Nombre de ${pkgName}`}
            />
            <span className="w-10 text-[10px] font-medium text-muted-foreground">
              {pkgName}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Scale className="h-3 w-3 shrink-0 text-muted-foreground" />
            <Input
              type="number"
              step="0.0001"
              min="0"
              inputMode="decimal"
              value={unitCountInput}
              onChange={(e) => onUnitCountChange(e.target.value)}
              className="h-7 text-right tabular-nums"
              aria-label={`Unités additionnelles (${unit})`}
              placeholder="0"
              title={`Unités additionnelles (${unit})`}
            />
            <span className="w-10 text-[10px] font-medium text-muted-foreground">
              {unit}
            </span>
          </div>
          {/* Total mis en évidence — l'utilisateur voit instantanément la
              quantité qui sera réellement stockée. */}
          <div className="mt-0.5 rounded bg-primary/[0.08] px-1.5 py-0.5 text-center text-[10px] font-semibold text-primary tabular-nums">
            = {formatNumber(toNumber(item.quantity), 2)} {unit}
          </div>
        </div>
      ) : (
        <Input
          type="number"
          step="0.0001"
          min="0"
          inputMode="decimal"
          value={unitCountInput}
          onChange={(e) => onUnitCountChange(e.target.value)}
          className="text-right tabular-nums"
          aria-label="Quantité"
        />
      )}

      {pkgActive ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-border/40 bg-background/60 p-1.5">
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={pkgPriceInput}
              onChange={(e) => onPkgPriceChange(e.target.value)}
              className="h-7 text-right tabular-nums"
              aria-label={`Prix par ${pkgName}`}
              title={`Prix par ${pkgName}`}
            />
            <span className="w-14 text-[10px] font-medium text-muted-foreground">
              {CURRENCY.symbol} / {pkgName}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground">
            <span>↓</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              step="0.0001"
              min="0"
              inputMode="decimal"
              value={item.unitPrice}
              onChange={(e) => onUnitPriceChange(e.target.value)}
              className="h-7 text-right tabular-nums"
              aria-label="Prix unitaire"
              title={`Prix par ${unit}`}
            />
            <span className="w-14 text-[10px] font-medium text-muted-foreground">
              {CURRENCY.symbol} / {unit}
            </span>
          </div>
        </div>
      ) : (
        <Input
          type="number"
          step="0.0001"
          min="0"
          inputMode="decimal"
          value={item.unitPrice}
          onChange={(e) => onUnitPriceChange(e.target.value)}
          className="text-right tabular-nums"
          aria-label="Prix unitaire"
        />
      )}

      <div className="self-center text-right text-sm font-medium tabular-nums">
        {currency.format(total)}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={`Supprimer la ligne ${idx + 1}`}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
