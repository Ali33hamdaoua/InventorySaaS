import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calendar, Fuel, Truck, StickyNote, Save, Lock } from 'lucide-react';
import { PURCHASE_ADDITIONAL_COST_LABEL } from '@inventorymdb/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { purchasesService, type Purchase } from '@/services/purchases.service';
import { currency, toNumber, MONTHS_FR, parseBusinessDate, formatBusinessDate } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  purchase: Purchase | null;
}

export function PurchaseDetailDialog({ open, onOpenChange, purchase }: Props) {
  const qc = useQueryClient();
  const [noteDraft, setNoteDraft] = useState('');

  // Reset draft whenever the dialog re-opens or the purchase changes.
  useEffect(() => {
    if (open && purchase) setNoteDraft(purchase.note ?? '');
  }, [open, purchase]);

  const noteMutation = useMutation({
    mutationFn: () => {
      if (!purchase) throw new Error('No purchase');
      // We only patch `note` — prices, lines and supplier are intentionally
      // off-limits from this dialog (the user must open the Purchases page to
      // touch those).
      return purchasesService.update(purchase.id, { note: noteDraft.trim() || null });
    },
    onSuccess: () => {
      toast.success('Note mise à jour. Lignes comptables synchronisées.');
      // Both the source purchase and the linked accounting rows refresh —
      // the note is mirrored into AccountingExpense.notes on every sync.
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['accounting'] });
    },
    onError: (e: unknown) => {
      const apiMsg =
        (typeof e === 'object' &&
          e !== null &&
          'response' in e &&
          (e as { response?: { data?: { message?: unknown } } }).response?.data?.message) ||
        null;
      toast.error((apiMsg as string) || 'Échec de la mise à jour de la note.');
    },
  });

  if (!purchase) return null;

  // TZ-safe: parse the business date by hand (split YYYY-MM-DD).
  // `new Date(purchase.purchaseDate)` would be UTC midnight and shift the
  // day off in Canada / Maroc.
  const dateObj = parseBusinessDate(purchase.purchaseDate) ?? new Date();
  const periodLabel = `${MONTHS_FR[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  const dateLabel = formatBusinessDate(purchase.purchaseDate, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const items = purchase.items ?? [];

  const subtotal = toNumber(purchase.subtotalHT);
  const tps = toNumber(purchase.tpsAmount);
  const tvq = toNumber(purchase.tvqAmount);
  const total = toNumber(purchase.totalAmount);
  const additionalCosts = purchase.additionalCosts ?? [];
  const additionalCostsHT = additionalCosts.reduce(
    (s, c) => s + toNumber(c.amountBeforeTax),
    0,
  );
  const additionalCostsTotal = additionalCosts.reduce(
    (s, c) => s + toNumber(c.totalAmount),
    0,
  );

  const noteDirty = (noteDraft ?? '').trim() !== (purchase.note ?? '').trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{purchase.supplier?.name ?? 'Achat'}</DialogTitle>
          <DialogDescription>Détail de l'achat fournisseur — {periodLabel}.</DialogDescription>
        </DialogHeader>

        {/* Compact header — supplier + date side-by-side */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-3">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Fournisseur
              </p>
              <p className="truncate text-sm font-medium">{purchase.supplier?.name ?? '—'}</p>
              {purchase.supplier?.contactName && (
                <p className="truncate text-xs text-muted-foreground">
                  {purchase.supplier.contactName}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-3">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Date</p>
              <p className="text-sm font-medium">{dateLabel}</p>
              <p className="text-xs text-muted-foreground">Période : {periodLabel}</p>
            </div>
          </div>
        </div>

        {/* Editable accountant note. The only field this dialog mutates —
            quantities / prices stay locked behind the Purchases page. */}
        <div className="space-y-1.5 rounded-md border border-border/60 bg-background/40 p-3">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            <label
              htmlFor="purchase-note"
              className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              Note pour le comptable
            </label>
          </div>
          <textarea
            id="purchase-note"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Ex. n° bon de livraison, motif de l'achat, à imputer sur la branche X…"
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[10px] text-muted-foreground">
              <Lock className="mr-1 inline h-2.5 w-2.5" />
              Pour changer prix, quantités ou fournisseur, ouvrez la section{' '}
              <strong className="text-foreground/80">Achats</strong>.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={!noteDirty || noteMutation.isPending}
              onClick={() => noteMutation.mutate()}
              className="btn-brand-glow h-8 gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {noteMutation.isPending ? 'Enregistrement…' : 'Enregistrer la note'}
            </Button>
          </div>
        </div>

        {/* Lines table */}
        <div className="overflow-x-auto rounded-md border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-background/40 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Produit</th>
                <th className="px-3 py-2 text-right font-medium">Qté</th>
                <th className="px-3 py-2 text-right font-medium">Prix u.</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Aucune ligne.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">
                      <span className="align-middle">{it.product?.name ?? '—'}</span>
                      {it.product?.unit && (
                        <span className="ml-1 align-middle text-xs text-muted-foreground">
                          ({it.product.unit})
                        </span>
                      )}
                      {/* Historique : le produit peut avoir été désactivé
                          après cet achat. Le badge évite l'ambiguïté sans
                          masquer la ligne. */}
                      {it.product && !it.product.isActive && (
                        <Badge
                          variant="outline"
                          className="ml-1.5 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] align-middle text-amber-500"
                          title="Produit désactivé — cette ligne d'historique reste inchangée."
                        >
                          Inactif
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {toNumber(it.quantity)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {currency.format(toNumber(it.unitPrice))}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {currency.format(toNumber(it.totalPrice))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Section frais supplémentaires — visible UNIQUEMENT si présents.
            N'affecte NI le sous-total produits ni le WAC. Comptabilisée
            séparément dans le rapport financier (HT via LOT 2). */}
        {additionalCosts.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-amber-500/30 bg-amber-500/[0.03]">
            <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
              <Fuel className="h-4 w-4 text-amber-500" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-500">
                Frais supplémentaires
              </h3>
              <span
                className="ml-auto text-[10px] text-muted-foreground"
                title="Comptabilisés séparément — n'affectent pas le prix des produits ni le WAC."
              >
                (compta séparée, HT dans le rapport financier)
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">HT</th>
                  <th className="px-3 py-2 text-right font-medium">Taxes</th>
                  <th className="px-3 py-2 text-right font-medium">TTC</th>
                </tr>
              </thead>
              <tbody>
                {additionalCosts.map((c) => {
                  const label =
                    PURCHASE_ADDITIONAL_COST_LABEL[
                      c.costType as keyof typeof PURCHASE_ADDITIONAL_COST_LABEL
                    ] ?? c.costType;
                  const ht = toNumber(c.amountBeforeTax);
                  const cTps = toNumber(c.tpsAmount);
                  const cTvq = toNumber(c.tvqAmount);
                  const cTotal = toNumber(c.totalAmount);
                  return (
                    <tr key={c.id} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 font-medium">{label}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {c.description || (
                          <span className="italic">
                            {c.accountingCategory?.name ?? '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {currency.format(ht)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {currency.format(cTps + cTvq)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {currency.format(cTotal)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-amber-500/30 bg-amber-500/[0.05]">
                  <td className="px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground" colSpan={2}>
                    Total frais
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {currency.format(additionalCostsHT)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                    {currency.format(additionalCostsTotal - additionalCostsHT)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {currency.format(additionalCostsTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Accountant-style totals block */}
        <div className="rounded-md border border-border/60 bg-background/40 p-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sous-total produits HT</span>
              <span className="tabular-nums">{currency.format(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">TPS produits</span>
              <span className="tabular-nums text-muted-foreground">{currency.format(tps)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">TVQ produits</span>
              <span className="tabular-nums text-muted-foreground">{currency.format(tvq)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2.5">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Total TTC produits
              </span>
              <span className={`tabular-nums ${additionalCosts.length > 0 ? 'text-base font-medium' : 'text-xl font-semibold'}`}>
                {currency.format(total)}
              </span>
            </div>
            {additionalCosts.length > 0 && (
              <>
                <div className="mt-3 flex items-center justify-between border-t border-amber-500/20 pt-2.5 text-sm">
                  <span className="text-muted-foreground">
                    Frais supplémentaires TTC
                  </span>
                  <span className="tabular-nums text-amber-500">
                    {currency.format(additionalCostsTotal)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-md border border-primary/30 bg-primary/[0.06] px-3 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Total facture
                  </span>
                  <span className="text-xl font-bold tabular-nums text-primary">
                    {currency.format(total + additionalCostsTotal)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
