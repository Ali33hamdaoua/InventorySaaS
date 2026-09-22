import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, RotateCw, Users } from 'lucide-react';
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
import { useUsers, useSetUserStatus } from '@/hooks/useUsers';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { useAuthStore } from '@/stores/auth.store';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { User, ListUsersParams } from '@/services/users.service';
import { UsersTable } from './UsersTable';
import { UsersFilters, type UsersFiltersValue } from './UsersFilters';
import { UserFormDialog } from './UserFormDialog';

export function UsersSettingsTab() {
  const currentUser = useAuthStore((s) => s.user);
  const { branches } = useActiveBranch();
  const setStatusMutation = useSetUserStatus();

  const [filters, setFilters] = useState<UsersFiltersValue>({
    search: '',
    role: '',
    branchId: '',
    isActive: '',
  });
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const queryParams: ListUsersParams = useMemo(() => {
    const p: ListUsersParams = {};
    if (debouncedSearch.trim()) p.search = debouncedSearch.trim();
    if (filters.role) p.role = filters.role;
    if (filters.branchId) p.branchId = filters.branchId;
    if (filters.isActive === 'true' || filters.isActive === 'false') {
      p.isActive = filters.isActive;
    }
    return p;
  }, [debouncedSearch, filters.role, filters.branchId, filters.isActive]);

  const usersQuery = useUsers(queryParams);
  const users = usersQuery.data ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<User | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (u: User) => {
    setEditing(u);
    setFormOpen(true);
  };
  const openToggle = (u: User) => {
    if (currentUser?.id === u.id) {
      toast.error('Vous ne pouvez pas modifier votre propre statut');
      return;
    }
    setConfirmTarget(u);
    setConfirmOpen(true);
  };

  const onConfirmToggle = async () => {
    if (!confirmTarget) return;
    try {
      await setStatusMutation.mutateAsync({
        id: confirmTarget.id,
        isActive: !confirmTarget.isActive,
      });
      toast.success(
        confirmTarget.isActive ? 'Utilisateur désactivé' : 'Utilisateur réactivé',
      );
      setConfirmOpen(false);
    } catch (err: unknown) {
      const apiMsg =
        (typeof err === 'object' &&
          err !== null &&
          'response' in err &&
          (err as { response?: { data?: { message?: unknown } } }).response?.data?.message) ||
        null;
      const msg = Array.isArray(apiMsg) ? apiMsg.join(', ') : apiMsg;
      toast.error((msg as string) || 'Échec de la mise à jour');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Utilisateurs & accès</h2>
          <p className="text-sm text-muted-foreground">
            Gérez les comptes, leurs rôles et l'accès aux succursales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => usersQuery.refetch()}
            disabled={usersQuery.isFetching}
            className="gap-2"
          >
            <RotateCw className={`h-3.5 w-3.5 ${usersQuery.isFetching ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button className="btn-brand-glow gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouvel utilisateur
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <UsersFilters
            filters={filters}
            onChange={setFilters}
            branches={branches}
            totalCount={users.length}
          />
        </CardHeader>
        <CardContent>
          {usersQuery.isError ? (
            <ErrorBlock
              title="Impossible de charger les utilisateurs"
              onRetry={() => usersQuery.refetch()}
              retrying={usersQuery.isFetching}
            />
          ) : !usersQuery.isLoading && users.length === 0 ? (
            <EmptyState
              title="Aucun utilisateur"
              description="Créez votre premier compte pour démarrer."
              icon={<Users className="h-5 w-5" />}
              action={
                <Button onClick={openCreate} className="btn-brand-glow gap-2">
                  <Plus className="h-4 w-4" />
                  Nouvel utilisateur
                </Button>
              }
            />
          ) : (
            <UsersTable
              users={users}
              loading={usersQuery.isLoading}
              currentUserId={currentUser?.id ?? null}
              onEdit={openEdit}
              onToggle={openToggle}
            />
          )}
        </CardContent>
      </Card>

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTarget?.isActive ? 'Désactiver le compte ?' : 'Réactiver le compte ?'}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget?.isActive ? (
                <>
                  <span className="font-medium text-foreground">{confirmTarget?.name}</span>{' '}
                  ({confirmTarget?.email}) ne pourra plus se connecter. Le compte est
                  conservé et peut être réactivé à tout moment.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">{confirmTarget?.name}</span>{' '}
                  pourra à nouveau se connecter.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
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
