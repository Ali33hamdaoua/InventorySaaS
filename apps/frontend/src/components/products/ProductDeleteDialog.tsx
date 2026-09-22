import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { productsService, type Product } from '@/services/products.service';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Le produit à supprimer. Ce dialog n'est utilisé QUE pour un produit
   *  inactif — la page appelante doit filtrer avant d'ouvrir. */
  product: Product | null;
}

/**
 * Dialog de suppression PHYSIQUE contrôlée.
 *
 * Flux :
 *  1. Charge `GET /products/:id/references` pour connaître le verdict.
 *  2. Si `canHardDelete=false` → affiche les compteurs et explique que
 *     le produit restera inactif (bouton delete désactivé).
 *  3. Si `canHardDelete=true`  → demande à l'utilisateur de taper le nom
 *     exact avant d'activer le bouton (confirmation forte, action
 *     irréversible).
 *
 * Aucun calcul métier n'est appelé, aucun historique n'est touché.
 */
export function ProductDeleteDialog({ open, onOpenChange, product }: Props) {
  const qc = useQueryClient();
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    if (open) setTypedName('');
  }, [open, product?.id]);

  const referencesQuery = useQuery({
    queryKey: ['products', 'references', product?.id],
    queryFn: () => productsService.getReferences(product!.id),
    enabled: open && !!product,
    // Toujours refetch à l'ouverture — l'état des références peut changer
    // entre deux consultations (nouvel achat, nouvelle période).
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: () => productsService.hardRemove(product!.id),
    onSuccess: () => {
      toast.success(`Produit « ${product!.name} » supprimé définitivement.`);
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const apiMsg =
        (typeof e === 'object' &&
          e !== null &&
          'response' in e &&
          typeof (e as { response?: { data?: { message?: unknown } } }).response
            ?.data?.message === 'string' &&
          (e as { response: { data: { message: string } } }).response.data.message) ||
        null;
      toast.error(apiMsg || 'Suppression refusée.');
    },
  });

  if (!product) return null;

  const refs = referencesQuery.data;
  const loading = referencesQuery.isLoading;
  const canDelete = refs?.canHardDelete === true;
  const nameMatches = typedName.trim() === product.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Supprimer définitivement « {product.name} »
          </DialogTitle>
          <DialogDescription>
            Cette action est IRRÉVERSIBLE. Elle retire physiquement le produit
            de la base de données. L'historique reste préservé car un produit
            référencé ne peut pas être supprimé.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyse des références historiques…
          </div>
        ) : !refs ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Impossible de vérifier les références. Réessayez.
          </div>
        ) : !canDelete ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  Suppression refusée : historique existant.
                </p>
                <p className="text-xs text-muted-foreground">
                  Ce produit apparaît dans{' '}
                  <span className="font-semibold text-foreground">
                    {refs.purchaseItemCount} achat(s)
                  </span>{' '}
                  et{' '}
                  <span className="font-semibold text-foreground">
                    {refs.inventoryLineCount} période(s) d'inventaire
                  </span>
                  . Pour préserver la traçabilité, il restera désactivé sans être
                  supprimé.
                </p>
                {refs.isActive && (
                  <p className="text-xs text-muted-foreground">
                    Désactivez ce produit d'abord (l'affichage l'exigeait déjà).
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
              <div>
                Références PurchaseItem :{' '}
                <span className="font-semibold text-foreground">{refs.purchaseItemCount}</span>
              </div>
              <div>
                Références InventoryLine :{' '}
                <span className="font-semibold text-foreground">
                  {refs.inventoryLineCount}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-name" className="text-sm">
                Tapez le nom exact du produit pour confirmer :
              </Label>
              <Input
                id="confirm-name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={product.name}
                autoComplete="off"
              />
            </div>
          </div>
        )}

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
            type="button"
            variant="destructive"
            disabled={!canDelete || !nameMatches || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Suppression…' : 'Supprimer définitivement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
