import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Scale, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { hasPackaging, toBaseUnits } from '@inventorymdb/shared';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { branchesService } from '@/services/branches.service';
import { stockTransfersService } from '@/services/stock-transfers.service';
import { cn, toNumber, formatNumber, parseDecimalInput } from '@/lib/utils';
import type { InventoryLine } from '@/services/inventory-lines.service';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: InventoryLine | null;
  periodId: string; // The period this line belongs to
  /** Branche de la periode. Peut etre absente si la periode n'est pas encore
   *  chargee — le backend la deduit alors du produit. */
  branchId?: string;
}

export function StockTransferDialog({ open, onOpenChange, line, periodId, branchId }: Props) {
  const qc = useQueryClient();

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesService.list({ includeInactive: false }),
    enabled: open,
  });

  // Succursale source : la periode si elle est chargee, sinon celle du produit
  // (un produit appartient a une seule succursale). Jamais de chaine vide.
  const sourceBranchId = branchId || line?.product.branchId || undefined;

  const availableBranches = branches.filter((b) => b.id !== sourceBranchId && b.isActive);

  const [toBranchId, setToBranchId] = useState('');
  const [note, setNote] = useState('');
  const [pkgCountInput, setPkgCountInput] = useState('0');
  const [unitCountInput, setUnitCountInput] = useState('0');

  const rawFactor = toNumber(line?.product.packagingFactor);
  const pkgActive = hasPackaging(line?.product.packagingName, rawFactor);
  const factor = pkgActive ? rawFactor : 0;
  const pkgName = line?.product.packagingName ?? '';
  const unit = line?.product.unit ?? '';
  const availableQty = toNumber(line?.availableQuantity);
  const openingQty = toNumber(line?.openingQuantity);
  const purchasesQty = toNumber(line?.purchasesQuantity);
  const transferNetQty = toNumber(line?.transferInQuantity) - toNumber(line?.transferOutQuantity);

  useEffect(() => {
    if (open) {
      setToBranchId('');
      setNote('');
      setPkgCountInput('0');
      setUnitCountInput('0');
    }
  }, [open, line]);

  // Compute the total base units from inputs
  const currentBaseQty = pkgActive
    ? toBaseUnits(toNumber(pkgCountInput), toNumber(unitCountInput), factor)
    : toNumber(unitCountInput);

  const isOverMax = currentBaseQty > availableQty;
  const isValid =
    currentBaseQty > 0 && !isOverMax && toBranchId !== '' && toBranchId !== sourceBranchId;

  const mutation = useMutation({
    mutationFn: () => {
      if (!line) throw new Error('Aucune ligne sélectionnée');
      return stockTransfersService.transfer({
        // '' n'est pas un UUID : on omet le champ plutot que d'envoyer du vide,
        // le backend le deduit alors de `productId`.
        ...(sourceBranchId ? { fromBranchId: sourceBranchId } : {}),
        toBranchId,
        productId: line.productId,
        quantity: currentBaseQty,
        note,
      });
    },
    onSuccess: () => {
      toast.success('Transfert effectué avec succès');
      qc.invalidateQueries({ queryKey: ['inventory-lines', periodId] });
      qc.invalidateQueries({ queryKey: ['inventory-periods'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['stock-transfers'] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      const apiMsg = e?.response?.data?.message || 'Échec du transfert';
      toast.error(apiMsg);
    },
  });

  if (!line) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Transférer du stock
          </DialogTitle>
          <DialogDescription>
            Déplacez une quantité de <strong>{line.product.name}</strong> vers une autre succursale. 
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Stock breakdown */}
          <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-sm">
            <div className="flex justify-between py-1 text-muted-foreground">
              <span>Début :</span>
              <span className="tabular-nums">{formatNumber(openingQty, 2)} {unit}</span>
            </div>
            <div className="flex justify-between py-1 text-muted-foreground">
              <span>Achats :</span>
              <span className="tabular-nums">{formatNumber(purchasesQty, 2)} {unit}</span>
            </div>
            <div className="flex justify-between py-1 text-muted-foreground">
              <span>Transferts :</span>
              <span className={cn('tabular-nums', transferNetQty > 0 ? 'text-emerald-500' : transferNetQty < 0 ? 'text-amber-500' : '')}>
                {transferNetQty > 0 ? '+' : ''}{formatNumber(transferNetQty, 2)} {unit}
              </span>
            </div>
            <div className="mt-2 flex justify-between border-t border-border/40 pt-2 font-medium">
              <span>Stock disponible :</span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatNumber(availableQty, 2)} {unit}
              </span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Succursale de destination</Label>
            <Select value={toBranchId} onValueChange={setToBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une succursale..." />
              </SelectTrigger>
              <SelectContent>
                {availableBranches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Quantité à transférer</Label>
            {pkgActive ? (
              <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 shrink-0 text-primary" />
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    inputMode="numeric"
                    value={pkgCountInput}
                    onChange={(e) => setPkgCountInput(e.target.value)}
                    className={cn('h-8 w-20 text-right tabular-nums', isOverMax && 'border-destructive')}
                  />
                  <span className="text-sm font-medium text-muted-foreground">{pkgName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={unitCountInput}
                    onChange={(e) => setUnitCountInput(parseDecimalInput(e.target.value))}
                    className={cn('h-8 w-20 text-right tabular-nums', isOverMax && 'border-destructive')}
                  />
                  <span className="text-sm font-medium text-muted-foreground">{unit}</span>
                </div>
                <div className="mt-2 text-right text-sm font-semibold tabular-nums text-primary">
                  Total : {formatNumber(currentBaseQty, 2)} {unit}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={unitCountInput}
                  onChange={(e) => setUnitCountInput(parseDecimalInput(e.target.value))}
                  className={cn('h-8 w-24 text-right tabular-nums', isOverMax && 'border-destructive')}
                />
                <span className="text-sm text-muted-foreground">{unit}</span>
              </div>
            )}
            
            {isOverMax && (
              <p className="text-xs text-destructive">
                La quantité dépasse le stock disponible ({formatNumber(availableQty, 2)} {unit}).
              </p>
            )}

            {!isOverMax && currentBaseQty > 0 && (
              <div className="mt-1 flex justify-between text-sm text-muted-foreground">
                <span>Après transfert :</span>
                <span className="font-medium tabular-nums text-primary">
                  {formatNumber(availableQty - currentBaseQty, 2)} {unit}
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Note (optionnelle)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Transfert exceptionnel pour événement..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button 
            onClick={() => mutation.mutate()} 
            disabled={!isValid || mutation.isPending}
            className="btn-brand-glow gap-2"
          >
            {mutation.isPending ? 'Transfert en cours...' : 'Transférer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
