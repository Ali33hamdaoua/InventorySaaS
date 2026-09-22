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
import { Button } from '@/components/ui/button';
import { productsService, type Product } from '@/services/products.service';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
}

export function ProductStatusDialog({ open, onOpenChange, product }: Props) {
  const qc = useQueryClient();
  const willDisable = !!product?.isActive;

  const mutation = useMutation({
    mutationFn: () =>
      product ? productsService.setStatus(product.id, !product.isActive) : Promise.reject(),
    onSuccess: () => {
      toast.success(willDisable ? 'Produit désactivé' : 'Produit réactivé');
      qc.invalidateQueries({ queryKey: ['products'] });
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
            {willDisable ? 'Désactiver le produit ?' : 'Réactiver le produit ?'}
          </DialogTitle>
          <DialogDescription>
            {willDisable ? (
              <>
                <span className="font-medium text-foreground">{product?.name}</span> sera caché des
                achats et de l'inventaire courant. Le produit n'est <strong>jamais</strong> supprimé
                : il pourra être réactivé à tout moment.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{product?.name}</span> redeviendra
                disponible dans les achats et l'inventaire.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
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
            {mutation.isPending
              ? 'Mise à jour…'
              : willDisable
                ? 'Désactiver'
                : 'Réactiver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
