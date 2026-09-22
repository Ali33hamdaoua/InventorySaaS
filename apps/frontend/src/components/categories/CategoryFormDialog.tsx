import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CategoryType } from '@inventorymdb/shared';
import { categoriesService, type Category, type CategoryPayload } from '@/services/categories.service';
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
import { BRAND } from '@/lib/brand';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category?: Category | null;
}

// Local schema tuned for the form (description treated as a plain string —
// transformed to `null` server-side when empty).
const formSchema = z.object({
  name: z.string().min(2, 'Nom requis (min 2 caractères)').max(120),
  description: z.string().max(500).default(''),
  categoryType: z.nativeEnum(CategoryType),
  isActive: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

export function CategoryFormDialog({ open, onOpenChange, category }: Props) {
  const qc = useQueryClient();
  const isEdit = !!category;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      categoryType: CategoryType.FOOD,
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: category?.name ?? '',
      description: category?.description ?? '',
      categoryType: category?.categoryType ?? CategoryType.FOOD,
      isActive: category?.isActive ?? true,
    });
  }, [open, category, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: CategoryPayload = {
        name: values.name,
        description: values.description.trim() ? values.description.trim() : null,
        categoryType: values.categoryType,
        isActive: values.isActive,
      };
      return isEdit
        ? categoriesService.update(category!.id, payload)
        : categoriesService.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Catégorie mise à jour' : 'Catégorie créée');
      qc.invalidateQueries({ queryKey: ['categories'] });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Mettez à jour les informations de la catégorie. Les seeds ${BRAND.name} restent modifiables.`
              : 'Les catégories sont disponibles dynamiquement dans Products, Purchases et le Dashboard.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">
              Nom <span className="text-destructive">*</span>
            </Label>
            <Input id="name" autoFocus {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...form.register('description')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="categoryType">
                Famille de coût <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={form.control}
                name="categoryType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="categoryType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CategoryType.FOOD}>Food (alimentaire)</SelectItem>
                      <SelectItem value={CategoryType.PAPIERS}>Paper (emballages)</SelectItem>
                      <SelectItem value={CategoryType.NETTOYAGE}>Cleaning (nettoyage)</SelectItem>
                      {/* NON_FOOD est volontairement absent du dropdown : on
                          force la reclassification vers Food / Paper / Cleaning.
                          Les anciennes catégories NON_FOOD restent visibles
                          tant qu'elles ne sont pas modifiées (gérées via badge
                          "à reclasser" côté table). */}
                      {field.value === CategoryType.NON_FOOD && (
                        <SelectItem value={CategoryType.NON_FOOD}>
                          ⚠ Non-food (legacy — à reclasser)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Le coût d'inventaire sera ventilé en Food Cost, Paper Cost et
                Cleaning Cost dans le rapport financier selon ce choix.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Statut</Label>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  {...form.register('isActive')}
                />
                Catégorie active
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="btn-brand-glow" disabled={mutation.isPending}>
              {mutation.isPending
                ? 'Enregistrement…'
                : isEdit
                  ? 'Enregistrer'
                  : 'Créer la catégorie'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
