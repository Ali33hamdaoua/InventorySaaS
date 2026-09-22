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
import { suppliersService, type Supplier } from '@/services/suppliers.service';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplier: Supplier | null;
}

export function SupplierStatusDialog({ open, onOpenChange, supplier }: Props) {
  const qc = useQueryClient();
  const willDisable = !!supplier?.isActive;
  const purchasesCount = supplier?.purchasesCount ?? 0;

  const mutation = useMutation({
    mutationFn: () =>
      supplier
        ? suppliersService.setStatus(supplier.id, !supplier.isActive)
        : Promise.reject(),
    onSuccess: () => {
      toast.success(willDisable ? 'Fournisseur désactivé' : 'Fournisseur réactivé');
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
    onError: () => toast.error('Échec de la mise à jour du statut'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {willDisable ? 'Désactiver le fournisseur ?' : 'Réactiver le fournisseur ?'}
          </DialogTitle>
          <DialogDescription>
            {willDisable ? (
              <>
                <span className="font-medium text-foreground">{supplier?.name}</span> ne sera plus
                proposé dans les nouveaux bons d'achat. Aucune donnée n'est supprimée : vous pouvez
                le réactiver à tout moment.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{supplier?.name}</span> redeviendra
                disponible dans la section Achats.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {willDisable && purchasesCount > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-1 text-amber-100/90">
              <p className="font-medium">
                Ce fournisseur contient {purchasesCount} achat{purchasesCount > 1 ? 's' : ''}.
              </p>
              <p className="text-muted-foreground">
                Il sera désactivé mais l'historique des achats restera conservé pour les rapports et
                les calculs de food cost.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant={willDisable ? 'destructive' : 'default'}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={willDisable ? '' : 'btn-brand-glow'}
          >
            {mutation.isPending ? 'Mise à jour…' : willDisable ? 'Désactiver' : 'Réactiver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
