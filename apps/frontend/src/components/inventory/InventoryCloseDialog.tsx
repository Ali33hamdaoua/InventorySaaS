import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Info } from 'lucide-react';
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
  inventoryPeriodsService,
  type InventoryPeriod,
} from '@/services/inventory-periods.service';
import { currency, toNumber, MONTHS_FR } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  period: InventoryPeriod | null;
}

export function InventoryCloseDialog({ open, onOpenChange, period }: Props) {
  const qc = useQueryClient();
  const [salesRevenue, setSalesRevenue] = useState<string>('');

  useEffect(() => {
    if (open) setSalesRevenue('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!period) return Promise.reject();
      const sales = salesRevenue.trim();
      return inventoryPeriodsService.close(period.id, {
        salesRevenue: sales === '' ? null : toNumber(sales),
      });
    },
    onSuccess: () => {
      toast.success('Période clôturée. Période suivante créée automatiquement.');
      qc.invalidateQueries({ queryKey: ['inventory-periods'] });
      qc.invalidateQueries({ queryKey: ['inventory-lines'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const apiMsg =
        (typeof e === 'object' &&
          e !== null &&
          'response' in e &&
          typeof (e as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
            'string' &&
          (e as { response: { data: { message: string } } }).response.data.message) ||
        null;
      toast.error(apiMsg || 'Échec de la clôture');
    },
  });

  if (!period) return null;
  const monthLabel = `${MONTHS_FR[period.month - 1]} ${period.year}`;
  const opening = toNumber(period.openingValue);
  const purchases = toNumber(period.purchasesValue);
  const closing = toNumber(period.closingValue);
  const realCost = toNumber(period.realCost);
  const previewFoodCost = salesRevenue.trim() && toNumber(salesRevenue) > 0
    ? (realCost / toNumber(salesRevenue)) * 100
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Clôturer la période {monthLabel}</DialogTitle>
          <DialogDescription>
            La clôture verrouille la période, génère le rapport mensuel et crée automatiquement la
            période suivante en copiant le stock final comme stock début.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-background/40 p-4 text-sm">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Aperçu calculs
          </p>
          <dl className="space-y-1.5 tabular-nums">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Début inventaire</dt>
              <dd>{currency.format(opening)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">+ Achats du mois</dt>
              <dd>{currency.format(purchases)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">− Fin inventaire</dt>
              <dd>{currency.format(closing)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-border/60 pt-2 font-semibold">
              <dt>= Cost réel</dt>
              <dd className="text-primary">{currency.format(realCost)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sales">Chiffre d'affaires du mois (optionnel)</Label>
          <Input
            id="sales"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={salesRevenue}
            onChange={(e) => setSalesRevenue(e.target.value)}
            placeholder="Ex. 9 500"
          />
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Si fourni, le food cost % sera calculé.{' '}
            {previewFoodCost !== null && (
              <span className="text-foreground">
                Aperçu : <strong>{previewFoodCost.toFixed(2)} %</strong>
              </span>
            )}
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-muted-foreground">
            Une fois clôturée, la période ne pourra plus être modifiée (sauf par un administrateur).
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            className="btn-brand-glow"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Clôture en cours…' : `Clôturer ${monthLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
