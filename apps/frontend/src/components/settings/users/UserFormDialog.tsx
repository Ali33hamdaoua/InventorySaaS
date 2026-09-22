import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import type { UserRole } from '@inventorymdb/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { User } from '@/services/users.service';
import { useCreateUser, useUpdateUser } from '@/hooks/useUsers';
import { useActiveBranch } from '@/hooks/useActiveBranch';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user?: User | null;
}

interface Errors {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  branchId?: string;
}

const NONE = '__none__';
const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: 'Owner — accès toutes succursales',
  ADMIN: 'Admin — toutes ou une succursale',
  MANAGER: 'Manager — une seule succursale',
};

export function UserFormDialog({ open, onOpenChange, user }: Props) {
  const isEdit = !!user;
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const pending = createMutation.isPending || updateMutation.isPending;
  const { branches } = useActiveBranch();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('MANAGER');
  const [branchId, setBranchId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setPassword('');
      setRole(user.role);
      setBranchId(user.branchId ?? '');
      setIsActive(user.isActive);
    } else {
      setName('');
      setEmail('');
      setPassword('');
      setRole('MANAGER');
      setBranchId('');
      setIsActive(true);
    }
    setErrors({});
  }, [open, user]);

  // If the user picks MANAGER but no branch is selected, surface an error
  // before submit (server also validates).
  const isManager = role === 'MANAGER';

  const validate = (): boolean => {
    const next: Errors = {};
    if (name.trim().length < 2) next.name = 'Nom requis (min 2 caractères)';
    if (!/.+@.+\..+/.test(email)) next.email = 'Email invalide';
    if (!isEdit && password.length < 8) {
      next.password = 'Mot de passe requis (min 8 caractères)';
    }
    if (isManager && !branchId) {
      next.branchId = 'Un manager doit être assigné à une succursale';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const branchValue = branchId === '' ? null : branchId;

    try {
      if (isEdit && user) {
        await updateMutation.mutateAsync({
          id: user.id,
          data: {
            name: name.trim(),
            email: email.trim(),
            role,
            branchId: branchValue,
            isActive,
          },
        });
        toast.success('Utilisateur mis à jour');
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          branchId: branchValue,
          isActive,
        });
        toast.success('Utilisateur créé');
      }
      onOpenChange(false);
    } catch (err: unknown) {
      const apiMsg =
        (typeof err === 'object' &&
          err !== null &&
          'response' in err &&
          (err as { response?: { data?: { message?: unknown } } }).response?.data?.message) ||
        null;
      const msg = Array.isArray(apiMsg) ? apiMsg.join(', ') : apiMsg;
      toast.error((msg as string) || 'Échec de l\'enregistrement');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modifiez le profil, le rôle ou la succursale assignée. Le mot de passe est géré séparément.'
              : 'Créez un compte avec un rôle et une succursale (obligatoire pour MANAGER).'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Manager Joliette"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="manager@maisonburger.local"
                className="font-mono text-xs"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            {!isEdit && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="password">
                  Mot de passe <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 caractères"
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="role">
                Rôle <span className="text-destructive">*</span>
              </Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">{ROLE_LABEL.OWNER}</SelectItem>
                  <SelectItem value="ADMIN">{ROLE_LABEL.ADMIN}</SelectItem>
                  <SelectItem value="MANAGER">{ROLE_LABEL.MANAGER}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branchId">
                Succursale {isManager && <span className="text-destructive">*</span>}
              </Label>
              <Select
                value={branchId === '' ? NONE : branchId}
                onValueChange={(v) => setBranchId(v === NONE ? '' : v)}
              >
                <SelectTrigger id="branchId">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {!isManager && (
                    <SelectItem value={NONE}>Toutes les succursales</SelectItem>
                  )}
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.branchId && (
                <p className="text-xs text-destructive">{errors.branchId}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p>
              Les <strong>managers</strong> sont limités à leur succursale assignée. Les{' '}
              <strong>owners</strong> et <strong>admins</strong> sans succursale assignée ont accès
              à toutes les succursales.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-[#ED312E]"
            />
            <span>Compte actif (peut se connecter)</span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="btn-brand-glow" disabled={pending}>
              {pending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer l\'utilisateur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
