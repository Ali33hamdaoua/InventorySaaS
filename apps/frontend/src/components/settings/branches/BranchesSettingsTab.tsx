import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, RotateCw, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAllBranches, useSetBranchStatus } from '@/hooks/useBranchesAdmin';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { useBranchStore } from '@/stores/branch.store';
import type { Branch } from '@/services/branches.service';
import { BranchesTable } from './BranchesTable';
import { BranchFormDialog } from './BranchFormDialog';

export function BranchesSettingsTab() {
  const branchesQuery = useAllBranches();
  const branches = branchesQuery.data ?? [];

  const { branchId: activeBranchId, branches: activeBranches } = useActiveBranch();
  const setSelectedBranch = useBranchStore((s) => s.setSelectedBranch);
  const setStatusMutation = useSetBranchStatus();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Branch | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (b: Branch) => {
    setEditing(b);
    setFormOpen(true);
  };
  const openToggle = (b: Branch) => {
    setConfirmTarget(b);
    setConfirmOpen(true);
  };

  const onConfirmToggle = async () => {
    if (!confirmTarget) return;
    const goingInactive = confirmTarget.isActive;
    try {
      await setStatusMutation.mutateAsync({
        id: confirmTarget.id,
        isActive: !confirmTarget.isActive,
      });
      toast.success(goingInactive ? 'Succursale désactivée' : 'Succursale réactivée');

      // If the user just deactivated the active branch, switch to another
      // active one so the BranchSwitcher / pages don't end up pointing at a
      // disabled branch.
      if (goingInactive && activeBranchId === confirmTarget.id) {
        const fallback = activeBranches.find((b) => b.id !== confirmTarget.id);
        if (fallback) {
          setSelectedBranch({ id: fallback.id, slug: fallback.slug, name: fallback.name });
          toast.info(`Sélection basculée vers ${fallback.name}`);
        }
      }
      setConfirmOpen(false);
    } catch (err: unknown) {
      const apiMsg =
        (typeof err === 'object' &&
          err !== null &&
          'response' in err &&
          typeof (err as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
            'string' &&
          (err as { response: { data: { message: string } } }).response.data.message) ||
        null;
      toast.error(apiMsg || 'Échec de la mise à jour');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Succursales</h2>
          <p className="text-sm text-muted-foreground">
            Toutes les données métier (produits, achats, inventaires, dépenses) sont scopées par
            succursale.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => branchesQuery.refetch()}
            disabled={branchesQuery.isFetching}
            className="gap-2"
          >
            <RotateCw
              className={`h-3.5 w-3.5 ${branchesQuery.isFetching ? 'animate-spin' : ''}`}
            />
            Actualiser
          </Button>
          <Button className="btn-brand-glow gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouvelle succursale
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="uppercase tracking-[0.18em]">
              {branches.length} succursale{branches.length > 1 ? 's' : ''}
            </span>
            <span>
              {branches.filter((b) => b.isActive).length} active(s) ·{' '}
              {branches.filter((b) => !b.isActive).length} inactive(s)
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {branchesQuery.isError ? (
            <ErrorBlock
              title="Impossible de charger les succursales"
              onRetry={() => branchesQuery.refetch()}
              retrying={branchesQuery.isFetching}
            />
          ) : !branchesQuery.isLoading && branches.length === 0 ? (
            <EmptyState
              title="Aucune succursale"
              description="Créez votre première succursale pour structurer vos données."
              icon={<Building2 className="h-5 w-5" />}
              action={
                <Button onClick={openCreate} className="btn-brand-glow gap-2">
                  <Plus className="h-4 w-4" />
                  Nouvelle succursale
                </Button>
              }
            />
          ) : (
            <BranchesTable
              branches={branches}
              loading={branchesQuery.isLoading}
              activeBranchId={activeBranchId}
              onEdit={openEdit}
              onToggle={openToggle}
            />
          )}
        </CardContent>
      </Card>

      <BranchFormDialog open={formOpen} onOpenChange={setFormOpen} branch={editing} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTarget?.isActive ? 'Désactiver la succursale ?' : 'Réactiver la succursale ?'}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget?.isActive ? (
                <>
                  <span className="font-medium text-foreground">{confirmTarget?.name}</span>{' '}
                  ne sera plus sélectionnable dans le switcher et n'apparaîtra plus dans les
                  listes filtrées par défaut. Les données existantes sont préservées.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">{confirmTarget?.name}</span>{' '}
                  redeviendra accessible dans toute l'application.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {confirmTarget?.isActive && activeBranchId === confirmTarget?.id && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90">
              C'est la succursale actuellement sélectionnée. La sélection basculera automatiquement
              vers une autre succursale active.
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button
              variant={confirmTarget?.isActive ? 'destructive' : 'default'}
              onClick={onConfirmToggle}
              disabled={setStatusMutation.isPending}
              className={confirmTarget?.isActive ? '' : 'btn-brand-glow'}
            >
              {setStatusMutation.isPending
                ? 'Mise à jour…'
                : confirmTarget?.isActive
                  ? 'Désactiver'
                  : 'Réactiver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
