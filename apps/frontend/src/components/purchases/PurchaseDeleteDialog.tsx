import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Button } from '@/components/ui/button';
import { purchasesService, type Purchase } from '@/services/purchases.service';
import { currency, toNumber, formatBusinessDate } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  purchase: Purchase | null;
}

export function PurchaseDeleteDialog({ open, onOpenChange, purchase }: Props) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      if (!purchase) return Promise.reject();
      return purchasesService.remove(purchase.id);
    },
    onSuccess: () => {
      toast.success('Achat et lignes comptables liées supprimés.');
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['accounting'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
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
      toast.error((msg as string) || 'Échec de la suppression');
    },
  });

  const total = purchase ? toNumber(purchase.totalAmount) : 0;
  // TZ-safe display — see `formatBusinessDate`.
  const dateStr = purchase ? formatBusinessDate(purchase.purchaseDate) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer cet achat ?</DialogTitle>
          <DialogDescription>
            L'achat du <span className="font-medium text-foreground">{dateStr}</span> auprès de{' '}
            <span className="font-medium text-foreground">{purchase?.supplier?.name ?? '—'}</span>{' '}
            ({currency.format(total)} TTC) sera définitivement retiré, ainsi que toutes ses lignes
            produits.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="space-y-1 text-amber-100/90">
            <p className="font-medium">Impact</p>
            <p className="text-muted-foreground">
              Le total des achats du mois et le cost réel de la période seront recalculés sans cet
              achat. Cette action est définitive.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Suppression…' : 'Supprimer définitivement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
