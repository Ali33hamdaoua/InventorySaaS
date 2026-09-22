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
import { categoriesService, type Category } from '@/services/categories.service';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category: Category | null;
}

export function CategoryStatusDialog({ open, onOpenChange, category }: Props) {
  const qc = useQueryClient();
  const willDisable = !!category?.isActive;
  const productCount = category?.productCount ?? 0;

  const mutation = useMutation({
    mutationFn: () =>
      category
        ? categoriesService.setStatus(category.id, !category.isActive)
        : Promise.reject(),
    onSuccess: () => {
      toast.success(willDisable ? 'Catégorie désactivée' : 'Catégorie réactivée');
      qc.invalidateQueries({ queryKey: ['categories'] });
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
            {willDisable ? 'Désactiver la catégorie ?' : 'Réactiver la catégorie ?'}
          </DialogTitle>
          <DialogDescription>
            {willDisable ? (
              <>
                <span className="font-medium text-foreground">{category?.name}</span> ne sera plus
                proposée dans les nouvelles créations de produits. Aucune donnée n'est supprimée :
                vous pouvez la réactiver à tout moment.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{category?.name}</span> redeviendra
                disponible dans tous les formulaires (Products, Purchases…).
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {willDisable && productCount > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-1 text-amber-100/90">
              <p className="font-medium">
                Cette catégorie contient {productCount} produit{productCount > 1 ? 's' : ''}.
              </p>
              <p className="text-muted-foreground">
                Les produits existants restent liés à la catégorie. Elle disparaît uniquement des
                listes de sélection pour les nouvelles créations.
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
