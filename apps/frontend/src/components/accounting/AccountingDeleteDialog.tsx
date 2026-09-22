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
import {
  accountingService,
  type AccountingExpense,
} from '@/services/accounting.service';
import { currency, toNumber } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: AccountingExpense | null;
}

export function AccountingDeleteDialog({ open, onOpenChange, expense }: Props) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      if (!expense) return Promise.reject();
      return accountingService.remove(expense.id);
    },
    onSuccess: () => {
      toast.success('Dépense supprimée');
      qc.invalidateQueries({ queryKey: ['accounting'] });
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
      toast.error(apiMsg || 'Échec de la suppression');
    },
  });

  const total = expense ? toNumber(expense.totalAmount) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer cette dépense ?</DialogTitle>
          <DialogDescription>
            La dépense{' '}
            <span className="font-medium text-foreground">
              {expense?.description ?? ''}
            </span>{' '}
            ({currency.format(total)}) sera retirée des rapports comptables. La suppression est
            réversible côté admin (soft delete) : l'historique est conservé.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="space-y-1 text-amber-100/90">
            <p className="font-medium">Impact sur l'export comptable</p>
            <p className="text-muted-foreground">
              Cette dépense n'apparaîtra plus dans l'export Excel/PDF transmis au comptable.
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
            {mutation.isPending ? 'Suppression…' : 'Supprimer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
