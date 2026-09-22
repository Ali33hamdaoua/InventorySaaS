import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  sumAmount,
  type PaymentMethod,
} from '@inventorymdb/shared';
import { BarChart3, Lock } from 'lucide-react';
import {
  PAYMENT_METHOD_LABEL_FR,
  PAYMENT_METHOD_OPTIONS,
} from '@/lib/accounting-options';
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
import { Combobox } from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  accountingService,
  type AccountingExpense,
  type AccountingExpensePayload,
} from '@/services/accounting.service';
import { accountingCategoriesService } from '@/services/accounting-categories.service';
import type { Supplier } from '@/services/suppliers.service';
import { currency, toNumber, dateInputValue, todayInputValue } from '@/lib/utils';
import { useActiveBranch } from '@/hooks/useActiveBranch';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: Supplier[];
  expense?: AccountingExpense | null;
}

interface Errors {
  expenseDate?: string;
  categoryName?: string;
  description?: string;
  amountBeforeTax?: string;
}

const NONE = '__none__';

/**
 * Per-source explainer shown in the auto-row banner. Tells the accountant
 * exactly which module to go modify if they need to change anything other
 * than the note.
 *
 * `LABOR` is intentionally omitted — Labor stays standalone and never writes
 * to AccountingExpense (the cleanup migration purged any legacy LABOR rows).
 * A stray LABOR row would fall back to the generic message below.
 */
const AUTO_SOURCE_NOTICE: Partial<
  Record<Exclude<AccountingExpense['sourceType'], 'MANUAL'>, string>
> = {
  PURCHASE:
    "Cette dépense vient d'un achat fournisseur. Modifiez l'achat source pour changer le montant.",
  REPAIR:
    'Cette dépense vient du module Réparations. Modifiez la réparation source pour changer le montant.',
};

const AUTO_SOURCE_NOTICE_FALLBACK =
  'Cette dépense est synchronisée depuis un autre module. Modifiez la source pour changer le montant.';

export function AccountingExpenseFormDialog({ open, onOpenChange, suppliers, expense }: Props) {
  const qc = useQueryClient();
  const isEdit = !!expense;
  const { branchId } = useActiveBranch();
  // Auto-synced rows (PURCHASE / LABOR / REPAIR) accept ONLY a `notes` patch.
  // We lock every other field in the form to mirror the backend constraint —
  // tampering with disabled inputs would just bounce off the 400 anyway.
  const isAutoExpense = isEdit && expense.sourceType !== 'MANUAL';
  const autoNotice = isAutoExpense
    ? (AUTO_SOURCE_NOTICE[
        expense.sourceType as Exclude<AccountingExpense['sourceType'], 'MANUAL'>
      ] ?? AUTO_SOURCE_NOTICE_FALLBACK)
    : null;

  const [expenseDate, setExpenseDate] = useState<string>(todayInputValue());
  const [categoryName, setCategoryName] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [amountBeforeTax, setAmountBeforeTax] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  // Per-row financial-report opt-in. Defaults to FALSE per client spec —
  // accountants tag each expense explicitly. Repairs come back from the
  // server with TRUE already set; the toggle reflects that on edit.
  const [includeInFinancialReports, setIncludeInFinancialReports] = useState<boolean>(false);
  const [errors, setErrors] = useState<Errors>({});

  // Datalist source — dynamic category names. The input is free-form, so
  // suggestions just speed up reuse; typing a brand-new name is encouraged.
  // `enabled: open` keeps the network quiet when the dialog is closed.
  const categoriesQuery = useQuery({
    queryKey: ['accounting-categories'],
    queryFn: accountingCategoriesService.list,
    enabled: open,
    staleTime: 60_000,
  });
  const categoryOptions = categoriesQuery.data ?? [];

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setExpenseDate(dateInputValue(expense.expenseDate));
      // Prefer the dynamic name; fall back to legacy enum value only if the
      // server somehow returned an unbacked row (defensive — shouldn't happen).
      setCategoryName(expense.categoryName ?? expense.category ?? '');
      setSupplierId(expense.supplierId ?? '');
      setSupplierName(expense.supplierName ?? '');
      setDescription(expense.description);
      setReferenceNumber(expense.referenceNumber ?? '');
      setPaymentMethod(expense.paymentMethod ?? '');
      setAmountBeforeTax(String(toNumber(expense.amountBeforeTax)));
      setNotes(expense.notes ?? '');
      setIncludeInFinancialReports(!!expense.includeInFinancialReports);
    } else {
      setExpenseDate(todayInputValue());
      setCategoryName('');
      setSupplierId('');
      setSupplierName('');
      setDescription('');
      setReferenceNumber('');
      setPaymentMethod('');
      setAmountBeforeTax('0');
      setNotes('');
      setIncludeInFinancialReports(false);
    }
    setErrors({});
  }, [open, expense]);

  // Live preview — same authoritative helper the backend uses.
  const amountPreview = useMemo(
    () => sumAmount(toNumber(amountBeforeTax)),
    [amountBeforeTax],
  );

  const visibleSuppliers = useMemo(() => {
    const active = suppliers.filter((s) => s.isActive);
    if (expense?.supplierId && !active.some((s) => s.id === expense.supplierId)) {
      const current = suppliers.find((s) => s.id === expense.supplierId);
      if (current) return [...active, current];
    }
    return active;
  }, [suppliers, expense]);

  const mutation = useMutation({
    mutationFn: async () => {
      // Auto-synced rows: notes + includeInFinancialReports patch.
      // Numbers / category / dates flow from the source module — we'd just
      // get a 400 back if we tried to ship them.
      if (isAutoExpense) {
        return accountingService.update(expense!.id, {
          notes: notes.trim() || null,
          includeInFinancialReports,
        });
      }
      const payload: AccountingExpensePayload = {
        expenseDate,
        supplierId: supplierId || null,
        supplierName: supplierName.trim() || null,
        categoryName: categoryName.trim(),
        description: description.trim(),
        referenceNumber: referenceNumber.trim() || null,
        paymentMethod: paymentMethod || null,
        amountBeforeTax: toNumber(amountBeforeTax),
        notes: notes.trim() || null,
        includeInFinancialReports,
        // Only sent on create — expense never moves between branches.
        ...(isEdit ? {} : { branchId: branchId ?? undefined }),
      };
      return isEdit
        ? accountingService.update(expense!.id, payload)
        : accountingService.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Dépense mise à jour' : 'Dépense créée');
      qc.invalidateQueries({ queryKey: ['accounting'] });
      // The mutation may have just created a new category on the fly —
      // refetch the dropdown so the next form shows it without a hard reload.
      qc.invalidateQueries({ queryKey: ['accounting-categories'] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const apiMsg =
        (typeof e === 'object' &&
          e !== null &&
          'response' in e &&
          typeof (e as { response?: { data?: { message?: unknown } } }).response?.data?.message !==
            'undefined' &&
          (e as { response: { data: { message: unknown } } }).response.data.message) ||
        null;
      const msg = Array.isArray(apiMsg) ? apiMsg.join(', ') : apiMsg;
      toast.error((msg as string) || 'Échec de l\'enregistrement');
    },
  });

  const validate = (): boolean => {
    // Auto rows only ever submit notes + includeInFinancialReports — every
    // other field is locked to the value mirrored from the source.
    if (isAutoExpense) {
      setErrors({});
      return true;
    }
    const next: Errors = {};
    if (!expenseDate) next.expenseDate = 'Date requise';
    if (!categoryName.trim()) next.categoryName = 'Catégorie requise';
    if (!description.trim()) next.description = 'Description requise';
    if (toNumber(amountBeforeTax) < 0) next.amountBeforeTax = 'Montant HT invalide';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isAutoExpense
              ? 'Modifier la note'
              : isEdit
                ? 'Modifier la dépense'
                : 'Nouvelle dépense'}
          </DialogTitle>
          <DialogDescription>
            {isAutoExpense ? (
              <>
                Les montants viennent du module source — seule la note interne
                est modifiable ici.
              </>
            ) : (
              <>
                Saisissez le <span className="font-medium text-foreground">montant</span> de
                la dépense.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {autoNotice && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/[0.06] p-3 text-xs">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Dépense synchronisée</p>
              <p className="text-muted-foreground">{autoNotice}</p>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expenseDate">
                Date dépense <span className="text-destructive">*</span>
              </Label>
              <Input
                id="expenseDate"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                disabled={isAutoExpense}
              />
              {errors.expenseDate && (
                <p className="text-xs text-destructive">{errors.expenseDate}</p>
              )}
            </div>

            {/*
              Free-form category picker. Visually identical to the other
              Selects in the form (same trigger height, border, chevron,
              dropdown panel), but accepts brand-new values too. Backend
              creates the row on save when the typed name doesn't match any
              existing category. See `Combobox` for the a11y / keyboard
              behaviour details.
            */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="categoryName">
                Catégorie <span className="text-destructive">*</span>
              </Label>
              <Combobox
                id="categoryName"
                value={categoryName}
                onChange={setCategoryName}
                options={categoryOptions.map((c) => c.name)}
                placeholder="Tapez ou choisissez…"
                disabled={isAutoExpense}
                emptyHint="Nouvelle catégorie — elle sera créée à l'enregistrement."
                aria-label="Catégorie"
              />
              <p className="text-[11px] text-muted-foreground">
                Choisissez une catégorie existante ou écrivez-en une nouvelle
                (ex. <em>Permis municipal</em>). Elle sera créée
                automatiquement et apparaîtra dans la liste pour les prochaines
                dépenses.
              </p>
              {errors.categoryName && (
                <p className="text-xs text-destructive">{errors.categoryName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="paymentMethod">Mode de paiement</Label>
              <Select
                value={paymentMethod || NONE}
                onValueChange={(v) => setPaymentMethod(v === NONE ? '' : (v as PaymentMethod))}
                disabled={isAutoExpense}
              >
                <SelectTrigger id="paymentMethod">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABEL_FR[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplierId">Fournisseur lié (optionnel)</Label>
              <Select
                value={supplierId || NONE}
                onValueChange={(v) => setSupplierId(v === NONE ? '' : v)}
                disabled={isAutoExpense}
              >
                <SelectTrigger id="supplierId">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Aucun (fournisseur libre)</SelectItem>
                  {visibleSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplierName">Fournisseur libre (si pas lié)</Label>
              <Input
                id="supplierName"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Hydro-Québec, Bell, etc."
                disabled={!!supplierId || isAutoExpense}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">
                Description <span className="text-destructive">*</span>
              </Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Facture électricité mai 2026…"
                disabled={isAutoExpense}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description}</p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="referenceNumber">N° facture / référence</Label>
              <Input
                id="referenceNumber"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="FA-2026-0042"
                className="font-mono"
                disabled={isAutoExpense}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card/40 p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Montants
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="amountBeforeTax">
                  Montant <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="amountBeforeTax"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountBeforeTax}
                  onChange={(e) => setAmountBeforeTax(e.target.value)}
                  className="text-right tabular-nums"
                  disabled={isAutoExpense}
                />
                {errors.amountBeforeTax && (
                  <p className="text-xs text-destructive">{errors.amountBeforeTax}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Total</Label>
                <div className="flex h-9 items-center justify-end rounded-md border border-border/60 bg-background px-3 text-right text-sm font-semibold tabular-nums text-primary">
                  {currency.format(amountPreview.total)}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Commentaire interne pour le comptable…"
            />
          </div>

          {/*
            Per-row opt-in for the financial report. Defaults to false — the
            accountant tags each expense explicitly. Stays editable even on
            auto rows (Repair / Purchase) so the user can opt a specific one
            out, e.g. a repair already booked in another system.
          */}
          <label
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2.5 text-sm transition-colors hover:border-primary/40"
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
              checked={includeInFinancialReports}
              onChange={(e) => setIncludeInFinancialReports(e.target.checked)}
            />
            <span className="space-y-0.5">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                Inclure dans les rapports financiers
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Si activé, cette dépense est utilisée dans le calcul du
                rapport financier mensuel (regroupée par sa catégorie réelle).
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="btn-brand-glow" disabled={mutation.isPending}>
              {mutation.isPending
                ? 'Enregistrement…'
                : isEdit
                  ? 'Enregistrer'
                  : 'Créer la dépense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
