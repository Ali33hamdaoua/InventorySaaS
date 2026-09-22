import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Wrench, Wand2 } from 'lucide-react';
import { REPAIR_STATUS_LABEL, TPS_RATE, TVQ_RATE, type RepairStatus } from '@inventorymdb/shared';
import {
  repairsService,
  type RepairEntry,
  type RepairEntryPayload,
} from '@/services/repairs.service';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KpiCard } from '@/components/charts/KpiCard';
import { EmptyState } from '@/components/ui/empty-state';
import {
  currency,
  formatBusinessDate,
  MONTHS_FR,
  parseDecimalInput,
  todayInputValue,
  toNumber,
} from '@/lib/utils';

const NOW = new Date();
const YEAR_OPTIONS = [NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1];
const STATUSES: RepairStatus[] = ['PLANNED', 'IN_PROGRESS', 'DONE'];

// TZ-safe display via `formatBusinessDate` — see lib/utils.ts.
const DATE_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

interface FormState {
  date: string;
  title: string;
  equipment: string;
  vendorName: string;
  amountBeforeTax: string;
  tpsAmount: string;
  tvqAmount: string;
  status: RepairStatus;
  notes: string;
}

function emptyForm(): FormState {
  return {
    date: todayInputValue(),
    title: '',
    equipment: '',
    vendorName: '',
    amountBeforeTax: '0',
    tpsAmount: '0',
    tvqAmount: '0',
    status: 'PLANNED',
    notes: '',
  };
}

function StatusBadge({ status }: { status: RepairStatus }) {
  const palette: Record<RepairStatus, string> = {
    PLANNED: 'border-amber-500/40 text-amber-300',
    IN_PROGRESS: 'border-blue-500/40 text-blue-300',
    DONE: 'border-emerald-500/40 text-emerald-300',
  };
  return (
    <Badge variant="outline" className={palette[status]}>
      {REPAIR_STATUS_LABEL[status]}
    </Badge>
  );
}

export default function RepairsPage() {
  const qc = useQueryClient();
  const { branchId, branch } = useActiveBranch();
  const [month, setMonth] = useState<number>(NOW.getMonth() + 1);
  const [year, setYear] = useState<number>(NOW.getFullYear());
  const [statusFilter, setStatusFilter] = useState<'' | RepairStatus>('');

  const params = useMemo(
    () => ({
      branchId: branchId ?? undefined,
      month,
      year,
      ...(statusFilter ? { status: statusFilter as RepairStatus } : {}),
    }),
    [branchId, month, year, statusFilter],
  );

  const entriesQuery = useQuery({
    queryKey: ['repairs', params],
    queryFn: () => repairsService.list(params),
    enabled: !!branchId,
  });
  const summaryQuery = useQuery({
    queryKey: ['repairs', 'summary', branchId, month, year],
    queryFn: () =>
      repairsService.summary({ branchId: branchId ?? undefined, month, year }),
    enabled: !!branchId,
  });

  const entries = entriesQuery.data ?? [];
  const summary = summaryQuery.data;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RepairEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    if (!formOpen) return;
    if (editing) {
      setForm({
        date: editing.date,
        title: editing.title,
        equipment: editing.equipment ?? '',
        vendorName: editing.vendorName ?? '',
        amountBeforeTax: editing.amountBeforeTax,
        tpsAmount: editing.tpsAmount,
        tvqAmount: editing.tvqAmount,
        status: editing.status,
        notes: editing.notes ?? '',
      });
    } else {
      setForm(emptyForm());
    }
  }, [formOpen, editing]);

  const previewTotal =
    toNumber(form.amountBeforeTax) + toNumber(form.tpsAmount) + toNumber(form.tvqAmount);

  const suggestTps = () =>
    setForm({ ...form, tpsAmount: (toNumber(form.amountBeforeTax) * TPS_RATE).toFixed(2) });
  const suggestTvq = () =>
    setForm({ ...form, tvqAmount: (toNumber(form.amountBeforeTax) * TVQ_RATE).toFixed(2) });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: RepairEntryPayload = {
        date: form.date,
        title: form.title.trim(),
        equipment: form.equipment.trim() || null,
        vendorName: form.vendorName.trim() || null,
        amountBeforeTax: toNumber(form.amountBeforeTax),
        tpsAmount: toNumber(form.tpsAmount),
        tvqAmount: toNumber(form.tvqAmount),
        status: form.status,
        notes: form.notes.trim() || null,
        ...(editing ? {} : { branchId: branchId ?? undefined }),
      };
      return editing
        ? repairsService.update(editing.id, payload)
        : repairsService.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Réparation mise à jour' : 'Réparation enregistrée');
      qc.invalidateQueries({ queryKey: ['repairs'] });
      setFormOpen(false);
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Échec de l'enregistrement");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => repairsService.remove(id),
    onSuccess: () => {
      toast.success('Réparation supprimée');
      qc.invalidateQueries({ queryKey: ['repairs'] });
    },
  });

  if (!branchId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sélectionnez une succursale pour gérer les réparations.
        </CardContent>
      </Card>
    );
  }

  const validateAndSubmit = () => {
    if (!form.title.trim()) {
      toast.error('Titre requis.');
      return;
    }
    if (toNumber(form.amountBeforeTax) < 0) {
      toast.error('Montant HT invalide.');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Réparations
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Maintenance équipement —{' '}
            <span className="text-primary">{branch?.name ?? 'Succursale'}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Suivi des interventions techniques. Total = HT + TPS + TVQ (recalculé serveur).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS_FR.map((label, i) => (
                <SelectItem key={label} value={String(i + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter || '__all__'}
            onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : (v as RepairStatus))}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Tous statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tous statuts</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {REPAIR_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="btn-brand-glow gap-2"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nouvelle réparation
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryQuery.isLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <KpiCard
              title={`Total — ${summary.selectedPeriod}`}
              value={currency.format(summary.totalAmount)}
              hint={`${summary.entriesCount} intervention${summary.entriesCount > 1 ? 's' : ''}`}
              icon={<Wrench className="h-4 w-4" />}
              accent
            />
            <KpiCard
              title="Prévues"
              value={String(summary.countByStatus.PLANNED)}
              hint="À démarrer"
            />
            <KpiCard
              title="En cours"
              value={String(summary.countByStatus.IN_PROGRESS)}
              hint="Actives ce mois"
            />
            <KpiCard
              title="Terminées"
              value={String(summary.countByStatus.DONE)}
              hint="Clôturées"
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Interventions — {MONTHS_FR[month - 1]} {year}
          </p>
        </CardHeader>
        <CardContent>
          {!entriesQuery.isLoading && entries.length === 0 ? (
            <EmptyState
              title="Aucune réparation"
              description="Saisissez la première intervention du mois."
              icon={<Wrench className="h-5 w-5" />}
              action={
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                  className="btn-brand-glow gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Nouvelle réparation
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-3 pb-2 font-medium">Date</th>
                    <th className="px-3 pb-2 font-medium">Statut</th>
                    <th className="px-3 pb-2 font-medium">Titre</th>
                    <th className="hidden px-3 pb-2 font-medium md:table-cell">Équipement</th>
                    <th className="hidden px-3 pb-2 font-medium lg:table-cell">Fournisseur</th>
                    <th className="px-3 pb-2 text-right font-medium">HT</th>
                    <th className="hidden px-3 pb-2 text-right font-medium md:table-cell">TPS</th>
                    <th className="hidden px-3 pb-2 text-right font-medium md:table-cell">TVQ</th>
                    <th className="px-3 pb-2 text-right font-medium">Total</th>
                    <th className="px-3 pb-2 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entriesQuery.isLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/40">
                          {Array.from({ length: 10 }).map((__, j) => (
                            <td key={j} className="px-3 py-3">
                              <Skeleton className="h-4 w-3/4" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : entries.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]"
                        >
                          <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                            {formatBusinessDate(e.date, DATE_FORMAT_OPTS)}
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge status={e.status} />
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-3 font-medium" title={e.title}>
                            {e.title}
                          </td>
                          <td className="hidden max-w-[160px] truncate px-3 py-3 text-muted-foreground md:table-cell">
                            {e.equipment ?? '—'}
                          </td>
                          <td className="hidden max-w-[160px] truncate px-3 py-3 text-muted-foreground lg:table-cell">
                            {e.vendorName ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                            {currency.format(toNumber(e.amountBeforeTax))}
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums text-muted-foreground md:table-cell">
                            {currency.format(toNumber(e.tpsAmount))}
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums text-muted-foreground md:table-cell">
                            {currency.format(toNumber(e.tvqAmount))}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">
                            {currency.format(toNumber(e.totalAmount))}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditing(e);
                                  setFormOpen(true);
                                }}
                                className="h-8 w-8"
                                aria-label="Modifier"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (window.confirm('Supprimer cette intervention ?')) {
                                    deleteMutation.mutate(e.id);
                                  }
                                }}
                                className="h-8 w-8 hover:text-destructive"
                                aria-label="Supprimer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier la réparation' : 'Nouvelle réparation'}</DialogTitle>
            <DialogDescription>
              Total = HT + TPS + TVQ. Cliquez sur la baguette pour proposer 5 % / 9,975 %.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rep-date">Date</Label>
              <Input
                id="rep-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-status">Statut</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as RepairStatus })}
              >
                <SelectTrigger id="rep-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {REPAIR_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rep-title">Titre</Label>
              <Input
                id="rep-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Remplacement compresseur frigo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-equipment">Équipement</Label>
              <Input
                id="rep-equipment"
                value={form.equipment}
                onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                placeholder="Frigo vitrine"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-vendor">Technicien / fournisseur</Label>
              <Input
                id="rep-vendor"
                value={form.vendorName}
                onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                placeholder="ABC Réfrigération"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rep-ht">Montant HT</Label>
              <Input
                id="rep-ht"
                type="text"
                inputMode="decimal"
                value={form.amountBeforeTax}
                onChange={(e) =>
                  setForm({ ...form, amountBeforeTax: parseDecimalInput(e.target.value) })
                }
                className="text-right tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-tps">TPS</Label>
              <div className="flex gap-1">
                <Input
                  id="rep-tps"
                  type="text"
                  inputMode="decimal"
                  value={form.tpsAmount}
                  onChange={(e) =>
                    setForm({ ...form, tpsAmount: parseDecimalInput(e.target.value) })
                  }
                  className="text-right tabular-nums"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={suggestTps}
                  title="Proposer 5 % du HT"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-primary"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-tvq">TVQ</Label>
              <div className="flex gap-1">
                <Input
                  id="rep-tvq"
                  type="text"
                  inputMode="decimal"
                  value={form.tvqAmount}
                  onChange={(e) =>
                    setForm({ ...form, tvqAmount: parseDecimalInput(e.target.value) })
                  }
                  className="text-right tabular-nums"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={suggestTvq}
                  title="Proposer 9,975 % du HT"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-primary"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Total TTC</Label>
              <div className="flex h-9 items-center justify-end rounded-md border border-border/60 bg-background px-3 text-right text-sm font-semibold tabular-nums text-primary">
                {currency.format(previewTotal)}
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rep-notes">Notes</Label>
              <textarea
                id="rep-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full resize-none rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button
              className="btn-brand-glow"
              onClick={validateAndSubmit}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
