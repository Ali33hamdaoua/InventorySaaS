import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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
import { useCreateBranch, useUpdateBranch } from '@/hooks/useBranchesAdmin';
import type { Branch } from '@/services/branches.service';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branch?: Branch | null;
}

interface Errors {
  name?: string;
  slug?: string;
}

const SLUG_RE = /^[a-z0-9-]+$/;

function slugify(input: string) {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function BranchFormDialog({ open, onOpenChange, branch }: Props) {
  const isEdit = !!branch;
  const createMutation = useCreateBranch();
  const updateMutation = useUpdateBranch();
  const pending = createMutation.isPending || updateMutation.isPending;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    if (branch) {
      setName(branch.name);
      setSlug(branch.slug);
      setAddress(branch.address ?? '');
      setIsActive(branch.isActive);
      setSlugTouched(true);
    } else {
      setName('');
      setSlug('');
      setAddress('');
      setIsActive(true);
      setSlugTouched(false);
    }
    setErrors({});
  }, [open, branch]);

  // Auto-derive slug from name as long as the user hasn't manually edited it.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const validate = (): boolean => {
    const next: Errors = {};
    if (name.trim().length < 1) next.name = 'Nom requis';
    if (!SLUG_RE.test(slug)) next.slug = 'Slug: lettres minuscules, chiffres ou tirets';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      address: address.trim() || null,
      isActive,
    };
    try {
      if (isEdit && branch) {
        await updateMutation.mutateAsync({ id: branch.id, data: payload });
        toast.success('Succursale mise à jour');
      } else {
        await createMutation.mutateAsync(payload);
        toast.success('Succursale créée');
      }
      onOpenChange(false);
    } catch (err: unknown) {
      const apiMsg =
        (typeof err === 'object' &&
          err !== null &&
          'response' in err &&
          typeof (err as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
            'string' &&
          (err as { response: { data: { message: string } } }).response.data.message) ||
        null;
      toast.error(apiMsg || 'Échec de l\'enregistrement');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifier la succursale' : 'Nouvelle succursale'}</DialogTitle>
          <DialogDescription>
            Les succursales scopent automatiquement les produits, achats, périodes d'inventaire et
            dépenses comptables.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">
              Nom <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Joliette"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">
              Slug <span className="text-destructive">*</span>
            </Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              placeholder="joliette"
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Identifiant court utilisé dans les URL et exports. Lettres minuscules, chiffres et tirets.
            </p>
            {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 rue Saint-Charles-Borromée Nord, Joliette (QC)"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-[#ED312E]"
            />
            <span>Succursale active</span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="btn-brand-glow" disabled={pending}>
              {pending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer la succursale'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
