import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Unlock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  inventoryPeriodsService,
  type InventoryPeriod,
} from '@/services/inventory-periods.service';
import { MONTHS_FR } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  period: InventoryPeriod | null;
}

/**
 * Dialog de confirmation pour la réouverture d'une période clôturée.
 * Seul OWNER/ADMIN a le bouton qui ouvre ce dialog (garde côté page).
 * Le backend re-vérifie la permission — défense en profondeur.
 *
 * Après succès, on rafraîchit les queries React Query au lieu de push
 * localement dans le cache : le status change (CLOSED → OPEN), les
 * agrégats deviennent live, tout doit être re-fetché du serveur.
 */
export function InventoryReopenDialog({ open, onOpenChange, period }: Props) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      if (!period) throw new Error('Pas de période');
      return inventoryPeriodsService.reopen(period.id);
    },
    onSuccess: (data) => {
      // Toast principal
      toast.success('Période réouverte — les chiffres seront recalculés à la prochaine clôture.');
      // Toast d'avertissement séparé si un rapport financier verrouillé
      // pointe sur ce mois. On le laisse en second toast (5s) pour que
      // l'utilisateur ait le temps de le lire.
      if (data.lockedReportWarning) {
        toast.warning(data.lockedReportWarning.message, { duration: 8000 });
      }
      qc.invalidateQueries({ queryKey: ['inventory-periods'] });
      qc.invalidateQueries({ queryKey: ['inventory-lines'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Échec de la réouverture');
    },
  });

  if (!period) return null;
  const periodLabel = `${MONTHS_FR[period.month - 1]} ${period.year}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5 text-primary" />
            Réouvrir la période — {periodLabel} ?
          </DialogTitle>
          <DialogDescription>
            Cette période est déjà clôturée. En la réouvrant, vous pourrez
            modifier les quantités ou ajouter des achats rétroactifs. Les
            chiffres seront recalculés lors de la prochaine clôture.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="space-y-1 text-amber-100/90">
            <p className="font-medium">Aucune donnée ne sera perdue</p>
            <p className="text-muted-foreground">
              Les lignes d'inventaire, les quantités saisies et les notes
              restent conservées. Le snapshot précédent reste figé jusqu'à
              la re-clôture, où il sera remplacé par les nouveaux totaux.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="gap-2"
          >
            <Unlock className="h-4 w-4" />
            {mutation.isPending ? 'Réouverture…' : 'Réouvrir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
