import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users, Clock, Wallet } from 'lucide-react';
import {
  laborService,
  type LaborEntry,
  type LaborEntryPayload,
} from '@/services/labor.service';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { CURRENCY } from '@/lib/brand';

const NOW = new Date();
const YEAR_OPTIONS = [NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1];

// Display options reused by every row. Goes through `formatBusinessDate`
// so the date the user picked stays the date the user sees (Canada / Maroc
// would otherwise drift off-by-one if we formatted via `new Date(stored)`).
const DATE_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

interface FormState {
  date: string;
  employeeName: string;
  role: string;
  hours: string;
  hourlyRate: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    date: todayInputValue(),
    employeeName: '',
    role: '',
    hours: '0',
    hourlyRate: '0',
    notes: '',
  };
}

export default function LaborPage() {
  const qc = useQueryClient();
  const { branchId, branch } = useActiveBranch();
  const [month, setMonth] = useState<number>(NOW.getMonth() + 1);
  const [year, setYear] = useState<number>(NOW.getFullYear());

  const entriesQuery = useQuery({
    queryKey: ['labor', branchId, month, year],
    queryFn: () =>
      laborService.list({ branchId: branchId ?? undefined, month, year }),
    enabled: !!branchId,
  });
  const summaryQuery = useQuery({
    queryKey: ['labor', 'summary', branchId, month, year],
    queryFn: () =>
      laborService.summary({ branchId: branchId ?? undefined, month, year }),
    enabled: !!branchId,
  });

  const entries = entriesQuery.data ?? [];
  const summary = summaryQuery.data;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LaborEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    if (!formOpen) return;
    if (editing) {
      setForm({
        date: editing.date,
        employeeName: editing.employeeName,
        role: editing.role ?? '',
        hours: editing.hours,
        hourlyRate: editing.hourlyRate,
        notes: editing.notes ?? '',
      });
    } else {
      setForm(emptyForm());
    }
  }, [formOpen, editing]);

  const previewTotal = useMemo(
    () => toNumber(form.hours) * toNumber(form.hourlyRate),
    [form.hours, form.hourlyRate],
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: LaborEntryPayload = {
        date: form.date,
        employeeName: form.employeeName.trim(),
        role: form.role.trim() || null,
        hours: toNumber(form.hours),
        hourlyRate: toNumber(form.hourlyRate),
        notes: form.notes.trim() || null,
        ...(editing ? {} : { branchId: branchId ?? undefined }),
      };
      return editing
        ? laborService.update(editing.id, payload)
        : laborService.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Saisie mise à jour' : 'Saisie enregistrée');
      qc.invalidateQueries({ queryKey: ['labor'] });
      setFormOpen(false);
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Échec de l'enregistrement");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => laborService.remove(id),
    onSuccess: () => {
      toast.success('Saisie supprimée');
      qc.invalidateQueries({ queryKey: ['labor'] });
    },
  });

  if (!branchId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sélectionnez une succursale pour gérer la main-d'œuvre.
        </CardContent>
      </Card>
    );
  }

  const validateAndSubmit = () => {
    if (!form.employeeName.trim()) {
      toast.error("Nom d'employé requis.");
      return;
    }
    if (toNumber(form.hours) <= 0) {
      toast.error('Heures > 0 requises.');
      return;
    }
    if (toNumber(form.hourlyRate) < 0) {
      toast.error('Taux horaire invalide.');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Main-d'œuvre
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Heures travaillées — <span className="text-primary">{branch?.name ?? 'Succursale'}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Saisissez les heures par employé. Total = heures × taux horaire (recalculé serveur).
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
          <Button
            className="btn-brand-glow gap-2"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nouvelle saisie
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
              hint={`${summary.entriesCount} saisie${summary.entriesCount > 1 ? 's' : ''}`}
              icon={<Wallet className="h-4 w-4" />}
              accent
            />
            <KpiCard
              title="Heures totales"
              value={`${summary.totalHours.toFixed(2)} h`}
              hint="Toutes saisies confondues"
              icon={<Clock className="h-4 w-4" />}
            />
            <KpiCard
              title="Employés distincts"
              value={String(summary.employeeCount)}
              hint="Au moins une saisie ce mois"
              icon={<Users className="h-4 w-4" />}
            />
            <KpiCard
              title="Taux horaire moyen"
              value={
                summary.totalHours > 0
                  ? currency.format(summary.totalAmount / summary.totalHours)
                  : '—'
              }
              hint="Total / Heures"
              icon={<Wallet className="h-4 w-4" />}
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Saisies — {MONTHS_FR[month - 1]} {year}
          </p>
        </CardHeader>
        <CardContent>
          {!entriesQuery.isLoading && entries.length === 0 ? (
            <EmptyState
              title="Aucune saisie"
              description="Ajoutez les heures travaillées pour démarrer le suivi du mois."
              icon={<Users className="h-5 w-5" />}
              action={
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                  className="btn-brand-glow gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Nouvelle saisie
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-3 pb-2 font-medium">Date</th>
                    <th className="px-3 pb-2 font-medium">Employé</th>
                    <th className="px-3 pb-2 font-medium">Rôle</th>
                    <th className="px-3 pb-2 text-right font-medium">Heures</th>
                    <th className="px-3 pb-2 text-right font-medium">Taux</th>
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
                          {Array.from({ length: 7 }).map((__, j) => (
                            <td key={j} className="px-3 py-3">
                              <Skeleton className="h-4 w-3/4" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : entries.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b border-border/40 last:border-0 hover:bg-[var(--hover-overlay)]"
                        >
                          <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                            {formatBusinessDate(e.date, DATE_FORMAT_OPTS)}
                          </td>
                          <td className="px-3 py-3 font-medium">{e.employeeName}</td>
                          <td className="px-3 py-3 text-muted-foreground">{e.role ?? '—'}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                            {toNumber(e.hours).toFixed(2)} h
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-muted-foreground">
                            {currency.format(toNumber(e.hourlyRate))}
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
                                  if (window.confirm('Supprimer cette saisie ?')) {
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Modifier la saisie' : 'Nouvelle saisie main-d\'œuvre'}
            </DialogTitle>
            <DialogDescription>
              Total = heures × taux horaire (recalculé serveur).
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lab-date">Date</Label>
              <Input
                id="lab-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-emp">Nom employé</Label>
              <Input
                id="lab-emp"
                value={form.employeeName}
                onChange={(e) => setForm({ ...form, employeeName: e.target.value })}
                placeholder="Ahmed"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-role">Rôle (optionnel)</Label>
              <Input
                id="lab-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Cuisinier, plonge…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-hours">Heures travaillées</Label>
              <Input
                id="lab-hours"
                type="text"
                inputMode="decimal"
                value={form.hours}
                onChange={(e) =>
                  setForm({ ...form, hours: parseDecimalInput(e.target.value) })
                }
                className="text-right tabular-nums"
                placeholder="8"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-rate">Taux horaire ({CURRENCY.code})</Label>
              <Input
                id="lab-rate"
                type="text"
                inputMode="decimal"
                value={form.hourlyRate}
                onChange={(e) =>
                  setForm({ ...form, hourlyRate: parseDecimalInput(e.target.value) })
                }
                className="text-right tabular-nums"
                placeholder="18"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Total (preview)
                </span>
                <span className="text-lg font-semibold tabular-nums text-primary">
                  {currency.format(previewTotal)}
                </span>
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lab-notes">Notes</Label>
              <textarea
                id="lab-notes"
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
