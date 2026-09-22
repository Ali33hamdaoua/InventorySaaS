import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PurchaseItemsEditor,
  type DraftItem,
} from './PurchaseItemsEditor';
import {
  AdditionalCostsEditor,
  type AdditionalCostDraft,
} from './AdditionalCostsEditor';
import { purchasesService, type Purchase } from '@/services/purchases.service';
import { inventoryPeriodsService } from '@/services/inventory-periods.service';
import { accountingCategoriesService } from '@/services/accounting-categories.service';
import type { Supplier } from '@/services/suppliers.service';
import type { Product } from '@/services/products.service';
import { toNumber, dateInputValue, todayInputValue, currency } from '@/lib/utils';
import { calculatePurchaseTotals } from '@inventorymdb/shared';
import { useActiveBranch } from '@/hooks/useActiveBranch';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: Supplier[];
  products: Product[];
  /** When set, the dialog is in edit mode. */
  purchase?: Purchase | null;
}

interface Errors {
  supplierId?: string;
  purchaseDate?: string;
  items?: string;
}

export function PurchaseFormDialog({ open, onOpenChange, suppliers, products, purchase }: Props) {
  const qc = useQueryClient();
  const isEdit = !!purchase;
  const { branchId } = useActiveBranch();

  // Fetch all inventory periods for the branch — used to detect if the
  // selected purchase date falls in a CLOSED period. `staleTime` mid-length
  // because periods rarely change mid-session.
  const periodsQuery = useQuery({
    queryKey: ['inventory-periods', 'for-purchase-form', branchId],
    queryFn: () => inventoryPeriodsService.list({ branchId: branchId ?? undefined }),
    enabled: !!branchId && open,
    staleTime: 60_000,
  });
  const periods = periodsQuery.data ?? [];

  const [supplierId, setSupplierId] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(todayInputValue());
  const [note, setNote] = useState<string>('');
  const [items, setItems] = useState<DraftItem[]>([
    { productId: '', quantity: '1', unitPrice: '0' },
  ]);
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCostDraft[]>([]);
  const [errors, setErrors] = useState<Errors>({});

  // Catégories comptables — nécessaires au picker de chaque frais
  // supplémentaire. Chargées à l'ouverture du dialog uniquement.
  const accountingCategoriesQuery = useQuery({
    queryKey: ['accounting-categories'],
    queryFn: () => accountingCategoriesService.list(),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const accountingCategories = accountingCategoriesQuery.data ?? [];

  useEffect(() => {
    if (!open) return;
    if (purchase) {
      setSupplierId(purchase.supplierId);
      setPurchaseDate(dateInputValue(purchase.purchaseDate));
      setNote(purchase.note ?? '');
      setItems(
        purchase.items && purchase.items.length > 0
          ? purchase.items.map((it) => ({
              productId: it.productId,
              quantity: String(toNumber(it.quantity)),
              unitPrice: String(toNumber(it.unitPrice)),
            }))
          : [{ productId: '', quantity: '1', unitPrice: '0' }],
      );
      // Frais existants → drafts. String pour permettre la saisie.
      setAdditionalCosts(
        (purchase.additionalCosts ?? []).map((c) => ({
          costType: c.costType,
          description: c.description ?? '',
          accountingCategoryId: c.accountingCategoryId,
          amountBeforeTax: String(toNumber(c.amountBeforeTax)),
        })),
      );
    } else {
      setSupplierId('');
      setPurchaseDate(todayInputValue());
      setNote('');
      setItems([{ productId: '', quantity: '1', unitPrice: '0' }]);
      setAdditionalCosts([]);
    }
    setErrors({});
  }, [open, purchase]);

  const visibleSuppliers = (() => {
    const active = suppliers.filter((s) => s.isActive);
    if (purchase && !active.some((s) => s.id === purchase.supplierId)) {
      const current = suppliers.find((s) => s.id === purchase.supplierId);
      if (current) return [...active, current];
    }
    return active;
  })();

  const visibleProducts = (() => {
    const active = products.filter((p) => p.isActive);
    if (!purchase) return active;
    const extra = (purchase.items ?? [])
      .map((it) => products.find((p) => p.id === it.productId))
      .filter(
        (p): p is Product =>
          !!p && !active.some((a) => a.id === p.id),
      );
    return [...active, ...extra];
  })();

  const mutation = useMutation({
    mutationFn: async () => {
      // Filtrer les frais valides (catégorie choisie ET montant > 0 —
      // un frais vide n'a pas de sens).
      const validCosts = additionalCosts
        .filter((c) => c.accountingCategoryId && c.costType)
        .filter((c) => toNumber(c.amountBeforeTax) > 0)
        .map((c) => ({
          costType: c.costType,
          description: c.description.trim() || undefined,
          accountingCategoryId: c.accountingCategoryId,
          amountBeforeTax: toNumber(c.amountBeforeTax),
        }));

      const payload = {
        supplierId,
        purchaseDate,
        note: note.trim() || null,
        items: items
          .filter((i) => i.productId && toNumber(i.quantity) > 0)
          .map((i) => ({
            productId: i.productId,
            quantity: toNumber(i.quantity),
            unitPrice: toNumber(i.unitPrice),
          })),
        // Frais supplémentaires. En EDIT on envoie toujours la liste (même
        // vide) pour permettre la suppression de tous les frais. En CREATE
        // on n'envoie que si non vide.
        ...(isEdit
          ? { additionalCosts: validCosts }
          : validCosts.length > 0
            ? { additionalCosts: validCosts }
            : {}),
        // Only sent on create — purchase can't be moved between branches.
        ...(isEdit ? {} : { branchId: branchId ?? undefined }),
      };
      return isEdit
        ? purchasesService.update(purchase!.id, payload)
        : purchasesService.create(payload);
    },
    onSuccess: () => {
      toast.success(
        isEdit
          ? 'Achat et lignes comptables mises à jour.'
          : 'Achat enregistré et lignes comptables créées automatiquement.',
      );
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['accounting'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      // Le backend vient d'écraser `Product.defaultCost` avec les prix
      // saisis (dernier prix payé). On refetch la liste des produits
      // pour que le prochain formulaire propose ces nouveaux prix — sinon
      // le cache React Query servirait l'ancien defaultCost à jamais.
      qc.invalidateQueries({ queryKey: ['products'] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const apiMsg =
        (typeof e === 'object' &&
          e !== null &&
          'response' in e &&
          (e as { response?: { data?: { message?: unknown } } }).response?.data?.message) ||
        null;
      const msg = Array.isArray(apiMsg) ? apiMsg.join(', ') : apiMsg;
      toast.error((msg as string) || 'Échec de l\'enregistrement');
    },
  });

  const validate = (): boolean => {
    const next: Errors = {};
    if (!supplierId) next.supplierId = 'Fournisseur requis';
    if (!purchaseDate) next.purchaseDate = 'Date requise';
    const validLines = items.filter(
      (i) => i.productId && toNumber(i.quantity) > 0,
    );
    if (validLines.length === 0) {
      next.items = 'Au moins une ligne avec un produit et une quantité > 0';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate();
  };

  // Détection : la date choisie tombe-t-elle dans une période d'inventaire
  // CLOSED de la branche active ? Le format `purchaseDate` est
  // "YYYY-MM-DD" (`Input type=date`), on l'analyse manuellement pour
  // rester TZ-safe (pas de `new Date(str)`).
  const closedPeriodForDate = useMemo(() => {
    if (!purchaseDate) return null;
    const [yStr, mStr] = purchaseDate.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!y || !m) return null;
    return (
      periods.find(
        (p) => p.year === y && p.month === m && p.status === 'CLOSED',
      ) ?? null
    );
  }, [purchaseDate, periods]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Modal large + sticky footer : donne l'espace pour saisir plusieurs
          lignes produits ET plusieurs frais sans que Enregistrer disparaisse
          en bas. Le corps scrolle indépendamment du header et du footer. */}
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-[960px] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6">
          <DialogTitle>{isEdit ? 'Modifier l\'achat' : 'Nouvel achat'}</DialogTitle>
          <DialogDescription>
            Le total est calculé depuis les lignes produits.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* Corps scrollable — seul cet élément scrolle. Header et footer
              restent visibles en permanence. */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplierId">
                Fournisseur <span className="text-destructive">*</span>
              </Label>
              <Select value={supplierId || undefined} onValueChange={setSupplierId}>
                <SelectTrigger id="supplierId">
                  <SelectValue placeholder="Sélectionner un fournisseur…" />
                </SelectTrigger>
                <SelectContent>
                  {visibleSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {!s.isActive && ' (inactif)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.supplierId && (
                <p className="text-xs text-destructive">{errors.supplierId}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="purchaseDate">
                Date d'achat <span className="text-destructive">*</span>
              </Label>
              <Input
                id="purchaseDate"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
              {errors.purchaseDate && (
                <p className="text-xs text-destructive">{errors.purchaseDate}</p>
              )}
              {/* Warning non-bloquant si la date choisie tombe dans une
                  période d'inventaire clôturée. L'achat peut quand même
                  être sauvé (utile pour la comptabilité) mais il ne
                  contribuera au food/paper/cleaning cost qu'après réouverture
                  + re-clôture de la période concernée. */}
              {closedPeriodForDate && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/[0.06] p-2 text-[11px]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <p className="text-amber-100/90">
                    Cette date appartient à la période d'inventaire{' '}
                    <strong className="text-foreground">
                      {closedPeriodForDate.month}/{closedPeriodForDate.year}
                    </strong>{' '}
                    qui est <strong>clôturée</strong>. L'achat sera enregistré
                    en comptabilité, mais il ne comptera dans l'inventaire
                    qu'après réouverture puis re-clôture de la période.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="note">Note (optionnel)</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Commentaire interne, n° de bon de livraison, etc."
              />
            </div>
          </div>

          <PurchaseItemsEditor
            items={items}
            products={visibleProducts}
            onChange={setItems}
            error={errors.items}
          />

          <AdditionalCostsEditor
            drafts={additionalCosts}
            accountingCategories={accountingCategories}
            onChange={setAdditionalCosts}
          />

          {/* Invoice grand total — combines the product lines with the
              additional costs. Updates live when either changes. Does NOT
              affect unitPrice, defaultCost, WAC, or food cost. */}
          {additionalCosts.length > 0 && (() => {
            const liveTotals = calculatePurchaseTotals(
              items.map((i) => ({ quantity: toNumber(i.quantity), unitPrice: toNumber(i.unitPrice) })),
            );
            const productsTotal = liveTotals.total;
            const acTotal = additionalCosts.reduce(
              (s, c) => s + toNumber(c.amountBeforeTax),
              0,
            );
            const grand = productsTotal + acTotal;
            return (
              <div className="rounded-md border border-primary/30 bg-primary/[0.06] p-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total produits</span>
                  <span className="tabular-nums">{currency.format(productsTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Frais supplémentaires</span>
                  <span className="tabular-nums text-amber-500">{currency.format(acTotal)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-primary/20 pt-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Total facture
                  </span>
                  <span className="text-lg font-bold tabular-nums text-primary">
                    {currency.format(grand)}
                  </span>
                </div>
              </div>
            );
          })()}
          </div>

          {/* Footer sticky — Enregistrer / Annuler toujours visibles. */}
          <DialogFooter className="shrink-0 border-t border-border/60 bg-card px-6 py-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="btn-brand-glow" disabled={mutation.isPending}>
              {mutation.isPending
                ? 'Enregistrement…'
                : isEdit
                  ? 'Enregistrer'
                  : 'Enregistrer l\'achat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
