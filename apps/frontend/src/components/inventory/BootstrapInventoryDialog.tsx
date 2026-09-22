import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inventoryPeriodsService } from '@/services/inventory-periods.service';
import { MONTHS_FR } from '@/lib/utils';
import { useActiveBranch } from '@/hooks/useActiveBranch';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const YEAR_OPTIONS = (() => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1];
})();

/**
 * One-time onboarding dialog — initializes the very first inventory period
 * for the branch and seeds lines for all active products. After this, the
 * close() flow auto-creates each subsequent month, so the user never sees
 * this dialog again.
 */
export function BootstrapInventoryDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { branchId } = useActiveBranch();
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());

  useEffect(() => {
    if (open) {
      setMonth(now.getMonth() + 1);
      setYear(now.getFullYear());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      inventoryPeriodsService.bootstrap({
        branchId: branchId ?? undefined,
        month,
        year,
      }),
    onSuccess: () => {
      toast.success('Inventaire initialisé. Les mois suivants seront créés automatiquement à la clôture.');
      qc.invalidateQueries({ queryKey: ['inventory-periods'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
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
      toast.error((msg as string) || "Impossible d'initialiser l'inventaire.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Initialiser l'inventaire</DialogTitle>
          <DialogDescription>
            Démarre le suivi d'inventaire pour cette succursale. Le système créera la première
            période et chargera tous les produits actifs. Les mois suivants seront créés
            automatiquement à chaque clôture.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bootstrap-month">Mois</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger id="bootstrap-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_FR.map((label, i) => (
                  <SelectItem key={label} value={String(i + 1)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bootstrap-year">Année</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger id="bootstrap-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            className="btn-brand-glow"
            disabled={mutation.isPending || !branchId}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Initialisation…' : "Initialiser l'inventaire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
