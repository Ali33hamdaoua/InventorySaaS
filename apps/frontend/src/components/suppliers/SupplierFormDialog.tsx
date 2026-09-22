import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  suppliersService,
  type Supplier,
  type SupplierPayload,
} from '@/services/suppliers.service';

const formSchema = z.object({
  name: z.string().min(2, 'Nom requis (min 2 caractères)').max(150),
  contactName: z.string().max(150).default(''),
  phone: z.string().max(40).default(''),
  email: z
    .string()
    .max(190)
    .default('')
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Email invalide'),
  address: z.string().max(255).default(''),
  notes: z.string().max(1000).default(''),
  isActive: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplier?: Supplier | null;
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: Props) {
  const qc = useQueryClient();
  const isEdit = !!supplier;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      contactName: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: supplier?.name ?? '',
      contactName: supplier?.contactName ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      address: supplier?.address ?? '',
      notes: supplier?.notes ?? '',
      isActive: supplier?.isActive ?? true,
    });
  }, [open, supplier, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: SupplierPayload = {
        name: values.name.trim(),
        contactName: values.contactName.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        address: values.address.trim() || null,
        notes: values.notes.trim() || null,
        isActive: values.isActive,
      };
      return isEdit
        ? suppliersService.update(supplier!.id, payload)
        : suppliersService.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Fournisseur mis à jour' : 'Fournisseur créé');
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Mettez à jour les informations du fournisseur. Les seeds La Maison du Burger restent modifiables.'
              : 'Ajoutez un fournisseur. Il sera disponible dynamiquement dans la section Achats.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input id="name" autoFocus {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contactName">Personne contact</Label>
              <Input id="contactName" placeholder="Prénom Nom" {...form.register('contactName')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" placeholder="+1 514 555 0000" {...form.register('phone')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="contact@…" {...form.register('email')} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Statut</Label>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#ED312E]"
                  {...form.register('isActive')}
                />
                Fournisseur actif
              </label>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Adresse</Label>
              <Input id="address" {...form.register('address')} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes internes</Label>
              <textarea
                id="notes"
                rows={3}
                className="flex min-h-[80px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Horaires de livraison, conditions de paiement, etc."
                {...form.register('notes')}
              />
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
                  : 'Créer le fournisseur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
