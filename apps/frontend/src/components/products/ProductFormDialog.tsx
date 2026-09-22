import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, DollarSign, Package } from 'lucide-react';
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
import { canAccessAllBranches, DEFAULT_PACKAGING_NAMES } from '@inventorymdb/shared';
import {
  productsService,
  type Product,
  type CreateProductResponse,
} from '@/services/products.service';
import type { Category } from '@/services/categories.service';
import type { Supplier } from '@/services/suppliers.service';
import { cn, toNumber } from '@/lib/utils';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { useAuthStore } from '@/stores/auth.store';
import { CURRENCY } from '@/lib/brand';

/** Form-side schema. We don't import the shared one because we want
 *  string-input-friendly types here (the API expects numbers, RHF gives strings). */
const formSchema = z
  .object({
    name: z.string().min(2, 'Nom requis (min 2 caractères)').max(150),
    unit: z.string().min(1, 'Unité requise').max(20),
    categoryId: z.string().uuid().optional().or(z.literal('')),
    supplierId: z.string().uuid().optional().or(z.literal('')),
    defaultCost: z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === 'string' ? Number(v.replace(',', '.')) : v))
      .pipe(z.number({ invalid_type_error: 'Coût invalide' }).nonnegative('Doit être ≥ 0')),
    minStockLevel: z
      .union([z.string(), z.number()])
      .transform((v) =>
        typeof v === 'string' ? (v === '' ? 0 : Number(v.replace(',', '.'))) : v,
      )
      .pipe(z.number({ invalid_type_error: 'Seuil invalide' }).nonnegative('Doit être ≥ 0')),
    isActive: z.boolean(),
    /** Packaging (optionnel). Le toggle `packagingEnabled` pilote la
     *  visibilité + la validation. Si false → payload envoie null/null. */
    packagingEnabled: z.boolean(),
    packagingName: z.string().max(40).default(''),
    packagingFactor: z
      .union([z.string(), z.number()])
      .transform((v) =>
        typeof v === 'string' ? (v === '' ? 0 : Number(v.replace(',', '.'))) : v,
      )
      .pipe(z.number({ invalid_type_error: 'Facteur invalide' }).min(0, 'Doit être > 0')),
    /** Cross-branch mirror toggle. Only honored on create, ignored on edit. */
    copyToOtherBranch: z.boolean(),
  })
  .superRefine((data, ctx) => {
    // Validation croisée : quand packaging est ON, name doit être renseigné
    // et factor doit être strictement positif. Si OFF, on ignore les 2 champs.
    if (data.packagingEnabled) {
      if (!data.packagingName || data.packagingName.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['packagingName'],
          message: 'Nom du conditionnement requis',
        });
      }
      if (!data.packagingFactor || data.packagingFactor <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['packagingFactor'],
          message: 'Facteur strictement > 0',
        });
      }
    }
  });
type FormValues = z.input<typeof formSchema>;
type ParsedValues = z.output<typeof formSchema>;

const UNITS = ['kg', 'g', 'L', 'ml', 'unit', 'box', 'pack', 'bag'] as const;
const NO_CATEGORY = '__none__';
const NO_SUPPLIER = '__none__';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: Category[];
  suppliers: Supplier[];
  /** When provided, the dialog is in edit mode. */
  product?: Product | null;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  categories,
  suppliers,
  product,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!product;
  const { branchId, branch: activeBranch, branches } = useActiveBranch();
  const role = useAuthStore((s) => s.user?.role ?? null);

  // Who can mirror cross-branch — backend enforces this too (returns 403 for
  // non-privileged users), but hiding the toggle in the UI avoids a confusing
  // "Forbidden" toast for MANAGERs who'd otherwise see it.
  const canCrossBranch = canAccessAllBranches(role);

  // Resolve the single "other" branch. The toggle is only meaningful when
  // exactly one other active branch exists (2-branch deployment). With 0 or
  // 3+ other active branches the toggle is hidden.
  const otherBranch = useMemo(() => {
    const others = branches.filter((b) => b.id !== branchId && b.isActive);
    return others.length === 1 ? others[0]! : null;
  }, [branches, branchId]);

  const showCrossBranchToggle = !isEdit && canCrossBranch && !!otherBranch;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      unit: 'kg',
      categoryId: '',
      supplierId: '',
      defaultCost: 0,
      minStockLevel: 0,
      isActive: true,
      packagingEnabled: false,
      packagingName: '',
      packagingFactor: 0,
      copyToOtherBranch: false,
    },
  });

  useEffect(() => {
    if (!open) return;
    if (product) {
      // Reload : détecter si le produit a un packaging effectif. NULL
      // côté serveur → packagingEnabled=false (mode unitaire, rétrocompat).
      const hasPk =
        !!product.packagingName &&
        product.packagingFactor !== null &&
        toNumber(product.packagingFactor) > 0;
      form.reset({
        name: product.name,
        unit: product.unit,
        categoryId: product.categoryId ?? '',
        supplierId: product.supplierId ?? '',
        defaultCost: toNumber(product.defaultCost),
        minStockLevel: toNumber(product.minStockLevel),
        isActive: product.isActive,
        packagingEnabled: hasPk,
        packagingName: product.packagingName ?? '',
        packagingFactor: hasPk ? toNumber(product.packagingFactor) : 0,
        copyToOtherBranch: false,
      });
    } else {
      form.reset({
        name: '',
        unit: 'kg',
        categoryId: '',
        supplierId: '',
        defaultCost: 0,
        minStockLevel: 0,
        isActive: true,
        packagingEnabled: false,
        packagingName: '',
        packagingFactor: 0,
        copyToOtherBranch: false,
      });
    }
  }, [open, product, form]);

  const mutation = useMutation({
    mutationFn: async (values: ParsedValues) => {
      const payload = {
        name: values.name,
        unit: values.unit,
        categoryId: values.categoryId ? values.categoryId : null,
        supplierId: values.supplierId ? values.supplierId : null,
        defaultCost: values.defaultCost,
        minStockLevel: values.minStockLevel,
        isActive: values.isActive,
        // Packaging : envoyé UNIQUEMENT quand le toggle est activé. Sinon
        // null explicite → backend efface les 2 colonnes (rétrocompat OK,
        // le produit repasse en mode unitaire).
        packagingName: values.packagingEnabled
          ? values.packagingName.trim()
          : null,
        packagingFactor: values.packagingEnabled ? values.packagingFactor : null,
        // branchId + copy are create-only — `update` strips them anyway, but
        // we keep the payload tight so we don't waste a round-trip toggle.
        ...(isEdit
          ? {}
          : {
              branchId: branchId ?? undefined,
              copyToOtherBranch: showCrossBranchToggle && values.copyToOtherBranch,
            }),
      };
      return isEdit
        ? productsService.update(product!.id, payload)
        : productsService.create(payload);
    },
    onSuccess: (data) => {
      // On edit, `data` is just a Product. On create, it's the wrapped
      // {product, copy} envelope. Both shapes are normalized here so the
      // toast logic only needs to think about one thing.
      const sourceBranchName = activeBranch?.name ?? 'la succursale active';
      if (isEdit) {
        toast.success('Produit mis à jour');
      } else {
        const result = data as CreateProductResponse;
        switch (result.copy?.status) {
          case 'created':
            toast.success(
              `Produit créé dans ${sourceBranchName} et ${result.copy.otherBranchName}.`,
            );
            break;
          case 'alreadyExisted':
            toast.success(
              `Produit créé dans ${sourceBranchName}. Il existait déjà dans ${result.copy.otherBranchName}.`,
            );
            break;
          case 'no_other_branch':
            // Toggle was on but no sibling branch exists — still a success,
            // just no copy to brag about.
            toast.success(`Produit créé dans ${sourceBranchName}.`);
            break;
          default:
            toast.success(`Produit créé dans ${sourceBranchName}.`);
        }
      }
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
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
      toast.error(apiMsg || 'Échec de l\'enregistrement');
    },
  });

  // Le toggle « Utiliser un conditionnement » sert aussi de disclosure :
  // sa case cochée = accordéon ouvert. Comportement stable et lisible,
  // évite un état supplémentaire à gérer pour l'utilisateur.
  const pkgOpen = form.watch('packagingEnabled');
  const pkgName = form.watch('packagingName');
  const pkgFactor = toNumber(form.watch('packagingFactor'));
  const unitLabel = form.watch('unit') || '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Modal 720px : donne l'espace horizontal pour un layout 2 colonnes,
          ce qui divise la hauteur totale par deux sur laptop 1366×768.
          Colonnes internes flex : header + body scrollable + footer sticky. */}
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-[720px] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6">
          <DialogTitle>{isEdit ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Mettez à jour les informations du produit.'
              : 'Renseignez les informations essentielles pour ajouter un produit.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values as ParsedValues))}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Corps scrollable — seule la zone entre header et footer scrolle,
              boutons Save/Cancel toujours visibles. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {/* Nom + statut actif sur la même ligne : le status est déplacé
                  ici (au lieu du bas) pour être vu dès le premier scan. */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">
                  Nom <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input id="name" autoFocus className="flex-1" {...form.register('name')} />
                  <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                      {...form.register('isActive')}
                    />
                    Actif
                  </label>
                </div>
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              {/* Ligne 2 : Unité + Catégorie sur 2 colonnes. */}
              <div className="space-y-1.5">
                <Label htmlFor="unit">
                  Unité <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="unit">
                        <SelectValue placeholder="Choisir…" />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="categoryId">Catégorie</Label>
                <Controller
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => {
                    const activeCategories = categories.filter((c) => c.isActive);
                    const currentId = field.value;
                    const currentInList = activeCategories.some((c) => c.id === currentId);
                    const currentCategory = !currentInList
                      ? categories.find((c) => c.id === currentId)
                      : undefined;
                    const visible = currentCategory
                      ? [...activeCategories, currentCategory]
                      : activeCategories;

                    return (
                      <Select
                        value={field.value ? field.value : NO_CATEGORY}
                        onValueChange={(v) => field.onChange(v === NO_CATEGORY ? '' : v)}
                      >
                        <SelectTrigger id="categoryId">
                          <SelectValue placeholder="— Aucune —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_CATEGORY}>— Aucune —</SelectItem>
                          {visible.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                              {!c.isActive && ' (inactive)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  }}
                />
              </div>

              {/* Ligne 3 : Fournisseur (col-span-2) — assez d'espace pour les noms longs. */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="supplierId">Fournisseur principal</Label>
                <Controller
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => {
                    const activeSuppliers = suppliers.filter((s) => s.isActive);
                    const currentId = field.value;
                    const currentInList = activeSuppliers.some((s) => s.id === currentId);
                    const currentSupplier = !currentInList
                      ? suppliers.find((s) => s.id === currentId)
                      : undefined;
                    const visible = currentSupplier
                      ? [...activeSuppliers, currentSupplier]
                      : activeSuppliers;

                    return (
                      <Select
                        value={field.value ? field.value : NO_SUPPLIER}
                        onValueChange={(v) => field.onChange(v === NO_SUPPLIER ? '' : v)}
                      >
                        <SelectTrigger id="supplierId">
                          <SelectValue placeholder="— Non assigné —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_SUPPLIER}>— Non assigné —</SelectItem>
                          {visible.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                              {!s.isActive && ' (inactif)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  }}
                />
              </div>

              {/* Ligne 4 : Coût + Seuil minimum sur 2 colonnes. */}
              <div className="space-y-1.5">
                <Label htmlFor="defaultCost" className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  Coût par défaut ({CURRENCY.code}) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="defaultCost"
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  {...form.register('defaultCost')}
                />
                {form.formState.errors.defaultCost && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.defaultCost.message as string}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="minStockLevel">Seuil minimum</Label>
                <Input
                  id="minStockLevel"
                  type="number"
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                  placeholder="0"
                  {...form.register('minStockLevel')}
                />
                {form.formState.errors.minStockLevel && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.minStockLevel.message as string}
                  </p>
                )}
              </div>

              {/* Copie inter-succursales — carte compacte, uniquement si applicable. */}
              {showCrossBranchToggle && otherBranch && (
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm transition-colors hover:border-primary/40 sm:col-span-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                    {...form.register('copyToOtherBranch')}
                  />
                  <span className="flex-1">
                    <span className="font-medium text-foreground">
                      Ajouter aussi dans {otherBranch.name}
                    </span>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      Utile si vous vendez ce produit dans les deux succursales.
                    </span>
                  </span>
                </label>
              )}

              {/* Accordéon Conditionnement — replié par défaut. Le clic sur
                  le header agit AUSSI comme toggle d'activation (le simple
                  fait de vouloir renseigner ces champs = activer la feature). */}
              <div className="rounded-lg border border-border/60 bg-background/40 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                    {...form.register('packagingEnabled')}
                  />
                  <Package className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1 font-medium text-foreground">
                    Ce produit est vendu en conditionnement
                  </span>
                  <span className="text-[11px] text-muted-foreground">optionnel</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      pkgOpen && 'rotate-180',
                    )}
                  />
                </label>

                {pkgOpen && (
                  <div className="border-t border-border/60 px-3 pb-3 pt-3">
                    <p className="mb-3 text-[11px] text-muted-foreground">
                      Cochez si ce produit est acheté par carton, pack, sac ou box.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="packagingName" className="text-xs">
                          Type
                        </Label>
                        <Input
                          id="packagingName"
                          list="packagingNameSuggestions"
                          placeholder="Carton, Sac, Pack…"
                          maxLength={40}
                          className="h-9"
                          {...form.register('packagingName')}
                        />
                        <datalist id="packagingNameSuggestions">
                          {DEFAULT_PACKAGING_NAMES.map((n) => (
                            <option key={n} value={n} />
                          ))}
                        </datalist>
                        {form.formState.errors.packagingName && (
                          <p className="text-xs text-destructive">
                            {form.formState.errors.packagingName.message as string}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="packagingFactor" className="text-xs">
                          Chaque {pkgName || 'conditionnement'} contient
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="packagingFactor"
                            type="number"
                            step="0.0001"
                            min="0.0001"
                            inputMode="decimal"
                            className="h-9 flex-1"
                            {...form.register('packagingFactor')}
                          />
                          <span className="whitespace-nowrap rounded-md bg-muted/40 px-2 py-1.5 text-xs font-medium text-foreground">
                            {unitLabel}
                          </span>
                        </div>
                        {form.formState.errors.packagingFactor && (
                          <p className="text-xs text-destructive">
                            {form.formState.errors.packagingFactor.message as string}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Récap compact — pas de bloc coloré massif, juste une
                        ligne d'info discrète avec un exemple concret. */}
                    {pkgName && pkgFactor > 0 && (
                      <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-xs">
                        <Package className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="text-muted-foreground">
                          Ex :{' '}
                          <span className="font-medium text-foreground">
                            2 {pkgName.toLowerCase()} + 1 {unitLabel}
                          </span>{' '}
                          →{' '}
                          <span className="font-semibold text-primary">
                            {(2 * pkgFactor + 1).toLocaleString(CURRENCY.locale)} {unitLabel}
                          </span>{' '}
                          stockés
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer sticky — toujours visible même quand le corps scrolle.
              shrink-0 + bg-card + border-t garantissent qu'il ne se fond pas
              dans le contenu et reste ancré au bas du dialog. */}
          <DialogFooter className="shrink-0 border-t border-border/60 bg-card px-6 py-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="btn-brand-glow" disabled={mutation.isPending}>
              {mutation.isPending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer le produit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
