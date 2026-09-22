import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  TrendingUp,
  Wallet,
  Receipt,
  Percent,
  PiggyBank,
  Activity,
  Lock,
  Unlock,
  Save,
  ShieldCheck,
} from 'lucide-react';
import {
  financialReportsService,
  type FinancialReport,
  type UpdateFinancialReportPayload,
} from '@/services/financial-reports.service';
import { exportsService } from '@/services/exports.service';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { Permission, useHasPermission } from '@/lib/permissions';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KpiCard } from '@/components/charts/KpiCard';
import { ExportDropdownButton } from '@/components/exports/ExportDropdownButton';
import { currency, MONTHS_FR, toNumber } from '@/lib/utils';

type RevenueDraft = {
  sales: string;
  discounts: string;
  employeeMeals: string;
  tips: string;
  otherRevenue: string;
  laborCost: string;
  notes: string;
};

const NOW = new Date();
const YEAR_OPTIONS = [NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1];

function reportToDraft(r: FinancialReport): RevenueDraft {
  return {
    sales: r.sales,
    discounts: r.discounts,
    employeeMeals: r.employeeMeals,
    tips: r.tips,
    otherRevenue: r.otherRevenue,
    laborCost: r.laborCost,
    notes: r.notes ?? '',
  };
}

function draftEquals(a: RevenueDraft, b: RevenueDraft) {
  return (
    toNumber(a.sales) === toNumber(b.sales) &&
    toNumber(a.discounts) === toNumber(b.discounts) &&
    toNumber(a.employeeMeals) === toNumber(b.employeeMeals) &&
    toNumber(a.tips) === toNumber(b.tips) &&
    toNumber(a.otherRevenue) === toNumber(b.otherRevenue) &&
    toNumber(a.laborCost) === toNumber(b.laborCost) &&
    (a.notes ?? '') === (b.notes ?? '')
  );
}

export default function FinancialReportsPage() {
  const qc = useQueryClient();
  const { branchId, branch } = useActiveBranch();
  const canLock = useHasPermission(Permission.LOCK_FINANCIAL_REPORT);

  const [month, setMonth] = useState<number>(NOW.getMonth() + 1);
  const [year, setYear] = useState<number>(NOW.getFullYear());

  const query = useQuery({
    queryKey: ['financial-reports', branchId, year, month],
    queryFn: () =>
      financialReportsService.get({ branchId: branchId ?? undefined, month, year }),
    enabled: !!branchId,
  });
  const report = query.data ?? null;

  const [draft, setDraft] = useState<RevenueDraft | null>(null);
  const [serverDraft, setServerDraft] = useState<RevenueDraft | null>(null);

  useEffect(() => {
    if (!report) return;
    const d = reportToDraft(report);
    setDraft(d);
    setServerDraft(d);
  }, [report]);

  const isDirty = useMemo(() => {
    if (!draft || !serverDraft) return false;
    return !draftEquals(draft, serverDraft);
  }, [draft, serverDraft]);

  const isLocked = report?.status === 'LOCKED';
  const readOnly = isLocked && !canLock;

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!report || !draft) throw new Error('No report');
      const payload: UpdateFinancialReportPayload = {
        sales: toNumber(draft.sales),
        discounts: toNumber(draft.discounts),
        employeeMeals: toNumber(draft.employeeMeals),
        tips: toNumber(draft.tips),
        otherRevenue: toNumber(draft.otherRevenue),
        laborCost: toNumber(draft.laborCost),
        notes: draft.notes.trim() || null,
      };
      return financialReportsService.update(report.id, payload);
    },
    onSuccess: () => {
      toast.success('Rapport enregistré');
      qc.invalidateQueries({ queryKey: ['financial-reports'] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Échec de l'enregistrement");
    },
  });

  const lockMutation = useMutation({
    mutationFn: () => financialReportsService.lock(report!.id),
    onSuccess: () => {
      toast.success('Rapport verrouillé');
      qc.invalidateQueries({ queryKey: ['financial-reports'] });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: () => financialReportsService.unlock(report!.id),
    onSuccess: () => {
      toast.success('Rapport déverrouillé');
      qc.invalidateQueries({ queryKey: ['financial-reports'] });
    },
  });

  if (!branchId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sélectionnez une succursale pour consulter le rapport financier.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        {/* Left column — title + status badge inline with the H1 so the badge
            describes the OBJECT being viewed (this report), not floating in
            the action toolbar where it competed visually with the buttons. */}
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Rapports financiers
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              P&L — <span className="text-primary">{branch?.name ?? 'Succursale'}</span>
            </h1>
            {report ? <StatusBadge status={report.status} /> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Saisissez les revenus du mois. Le food cost, les dépenses comptables, le profit
            et la marge sont calculés automatiquement.
          </p>
        </div>

        {/* Right column — toolbar split into TWO logical groups, separated by
            a subtle vertical divider on wide screens:
              1. Period pickers (Mois / Année) — "what am I looking at"
              2. Actions (Exporter / Verrouiller / Enregistrer) — ordered
                 secondary → safety → primary, so the red "Enregistrer" lands
                 on the far right (desktop convention for the primary CTA).
            Both groups wrap independently on narrow screens; the divider
            disappears in the wrap. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
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
          </div>

          <div
            aria-hidden="true"
            className="hidden h-8 w-px self-center bg-border/60 lg:block"
          />

          <div className="flex flex-wrap items-center gap-2">
            <ExportDropdownButton
              disabled={!report}
              onExport={(format) =>
                report ? exportsService.financialReport(report.id, format) : Promise.resolve()
              }
            />
            {canLock && report && (
              <Button
                variant="outline"
                onClick={() => (isLocked ? unlockMutation.mutate() : lockMutation.mutate())}
                disabled={lockMutation.isPending || unlockMutation.isPending}
                className="gap-2"
                title={isLocked ? 'Déverrouiller pour modifier' : 'Verrouiller (snapshot)'}
              >
                {isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {isLocked ? 'Déverrouiller' : 'Verrouiller'}
              </Button>
            )}
            {!readOnly && (
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!isDirty || saveMutation.isPending}
                className="btn-brand-glow gap-2"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            )}
          </div>
        </div>
      </header>

      {isLocked && (
        <Card className="border-amber-500/30 bg-amber-500/[0.04]">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div className="space-y-1">
              <p className="font-medium">
                Rapport verrouillé{report?.lockedBy ? ` par ${report.lockedBy.name}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                Les valeurs ci-dessous proviennent du snapshot pris au verrouillage. Elles ne
                bougent plus même si les achats / dépenses du mois sont modifiés ensuite.
                {canLock && ' Déverrouillez pour repasser en mode live.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <KpiSection report={report} loading={query.isLoading} />

      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueCard draft={draft} setDraft={setDraft} readOnly={readOnly} loading={query.isLoading} />
        <ExpenseBreakdownCard report={report} loading={query.isLoading} />
      </div>

      {report && <SummaryBlock report={report} branchName={branch?.name ?? ''} month={month} year={year} />}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function StatusBadge({ status }: { status: 'DRAFT' | 'LOCKED' }) {
  return status === 'LOCKED' ? (
    <Badge variant="outline" className="border-amber-500/40 text-amber-300">
      <Lock className="mr-1 h-3 w-3" /> Verrouillé
    </Badge>
  ) : (
    <Badge variant="outline" className="border-primary/40 text-primary">
      Brouillon
    </Badge>
  );
}

function KpiSection({ report, loading }: { report: FinancialReport | null; loading: boolean }) {
  if (loading || !report) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  const netRev = toNumber(report.netRevenue);
  const totalExp = toNumber(report.totalExpenses);
  const netProfit = toNumber(report.netProfit);
  const netMargin = report.netMarginPercentage ? toNumber(report.netMarginPercentage) : null;
  const foodCostPct = report.foodCostPercentage ? toNumber(report.foodCostPercentage) : null;
  const expenseRatio = report.expenseRatio ? toNumber(report.expenseRatio) : null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <KpiCard
        title="Revenus nets"
        value={currency.format(netRev)}
        hint="sales − discounts − emp. meals + tips + other"
        icon={<Wallet className="h-4 w-4" />}
        accent
      />
      <KpiCard
        title="Dépenses totales"
        value={currency.format(totalExp)}
        hint="food + comptabilité + labor"
        icon={<Receipt className="h-4 w-4" />}
      />
      <KpiCard
        title="Profit net"
        value={currency.format(netProfit)}
        hint={netProfit >= 0 ? 'Bénéfice du mois' : 'Perte du mois'}
        icon={<PiggyBank className="h-4 w-4" />}
      />
      <KpiCard
        title="Marge nette"
        value={netMargin !== null ? `${netMargin.toFixed(2)} %` : '—'}
        hint="net profit / net revenue"
        icon={<TrendingUp className="h-4 w-4" />}
      />
      <KpiCard
        title="Food cost"
        value={foodCostPct !== null ? `${foodCostPct.toFixed(2)} %` : '—'}
        hint="food / net revenue"
        icon={<Percent className="h-4 w-4" />}
      />
      <KpiCard
        title="Coût opérationnel"
        value={expenseRatio !== null ? `${expenseRatio.toFixed(2)} %` : '—'}
        hint="dépenses totales / net revenue"
        icon={<Activity className="h-4 w-4" />}
      />
    </div>
  );
}

function RevenueCard({
  draft,
  setDraft,
  readOnly,
  loading,
}: {
  draft: RevenueDraft | null;
  setDraft: (next: RevenueDraft) => void;
  readOnly: boolean;
  loading: boolean;
}) {
  if (loading || !draft) {
    return (
      <Card>
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Revenus du mois
          </p>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48" />
        </CardContent>
      </Card>
    );
  }
  const set = (patch: Partial<RevenueDraft>) => setDraft({ ...draft, ...patch });
  return (
    <Card>
      <CardHeader>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Revenus du mois
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Row label="Sales" value={draft.sales} onChange={(v) => set({ sales: v })} readOnly={readOnly} />
        <Row label="Discounts" value={draft.discounts} onChange={(v) => set({ discounts: v })} readOnly={readOnly} hint="déduit" />
        <Row label="Employee meals" value={draft.employeeMeals} onChange={(v) => set({ employeeMeals: v })} readOnly={readOnly} hint="déduit" />
        <Row label="Tips" value={draft.tips} onChange={(v) => set({ tips: v })} readOnly={readOnly} />
        <Row label="Other revenue" value={draft.otherRevenue} onChange={(v) => set({ otherRevenue: v })} readOnly={readOnly} />
        <div className="border-t border-border/60 pt-3" />
        <Row label="Labor cost (manuel)" value={draft.laborCost} onChange={(v) => set({ laborCost: v })} readOnly={readOnly} hint="V1 : pas de POS" />
        <div className="space-y-1.5">
          <Label htmlFor="notes" className="text-xs text-muted-foreground">
            Notes
          </Label>
          <textarea
            id="notes"
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            disabled={readOnly}
            rows={3}
            placeholder="Commentaire interne, événements du mois…"
            className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-60"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  onChange,
  readOnly,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="flex-1 text-sm">
        {label}
        {hint && (
          <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {hint}
          </span>
        )}
      </Label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        className="h-8 w-32 text-right tabular-nums"
      />
    </div>
  );
}

function ExpenseBreakdownCard({
  report,
  loading,
}: {
  report: FinancialReport | null;
  loading: boolean;
}) {
  if (loading || !report) {
    return (
      <Card>
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Dépenses consolidées
          </p>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48" />
        </CardContent>
      </Card>
    );
  }
  const netRevenue = toNumber(report.netRevenue);
  const pct = (amount: number) =>
    netRevenue > 0 ? ` (${((amount / netRevenue) * 100).toFixed(2)} %)` : '';

  // V4 ventilation : 3 lignes Food/Paper/Cleaning + total Real Cost en
  // sous-total visible (rendu en mode "indent" pour montrer que c'est la
  // somme des 3 au-dessus). Labor reste sa propre ligne distincte.
  const foodCost = toNumber(report.foodCost);
  const paperCost = toNumber(report.paperCost);
  const cleaningCost = toNumber(report.cleaningCost);
  const realCost = toNumber(report.realCost);

  const rows: { label: string; source: string; amount: number; emphasize?: boolean }[] = [];
  rows.push({ label: 'Food cost', source: 'Inventaire', amount: foodCost });
  rows.push({ label: 'Paper cost', source: 'Inventaire', amount: paperCost });
  rows.push({ label: 'Cleaning cost', source: 'Inventaire', amount: cleaningCost });
  rows.push({
    label: 'Real cost (sous-total inventaire)',
    source: 'Inventaire',
    amount: realCost,
    emphasize: true,
  });
  // Labor is its own line — source `LaborEntry.totalAmount`, NOT the
  // accounting module. Renamed to match the rest of the FR UI.
  rows.push({
    label: 'Main-d\'œuvre',
    source: 'Main d\'œuvre',
    amount: toNumber(report.laborCost),
  });
  // `expensesByCategory` is keyed by the REAL category name (dynamic table).
  // Filter out any leftover "Main-d'œuvre" key that might survive in a
  // LOCKED snapshot from before the dedup fix — backend stopped injecting it
  // but historical snapshots can still have it stuck in their JSON blob.
  for (const [name, amount] of Object.entries(report.expensesByCategory)) {
    if (name.toLowerCase() === 'main-d\'œuvre') continue;
    rows.push({ label: name, source: 'Comptabilité', amount: amount ?? 0 });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Dépenses consolidées (HT)
        </p>
        <span className="text-xs text-muted-foreground">
          Total : <strong className="text-foreground">{currency.format(toNumber(report.totalExpenses))}</strong>
        </span>
      </CardHeader>
      <CardContent>
        {/* Rappel HT — le rapport financier consomme uniquement le montant
            hors taxes des dépenses comptables. TPS/TVQ restent visibles
            dans la section Comptabilité. */}
        <p
          className="mb-3 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground"
          title="Les dépenses comptables sont présentées hors taxes. La TPS et la TVQ restent disponibles dans la section Comptabilité."
        >
          Les dépenses comptables sont présentées <strong>hors taxes</strong>.
          La TPS et la TVQ restent visibles dans la section Comptabilité.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-3 pb-2 font-medium">Catégorie</th>
                <th className="px-3 pb-2 font-medium">Source</th>
                <th className="px-3 pb-2 text-right font-medium">Montant (HT)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={
                    'border-b border-border/40 last:border-0' +
                    (r.emphasize
                      ? ' bg-primary/[0.05] font-medium text-foreground'
                      : '')
                  }
                >
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.source}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {currency.format(r.amount)}
                    <span className="ml-1 text-[10px] text-muted-foreground">{pct(r.amount)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.inventoryPeriod && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Food cost = realCost de la période d'inventaire{' '}
            <strong>
              {report.inventoryPeriod.status === 'OPEN'
                ? `${MONTHS_FR[report.inventoryPeriod.month - 1]} ${report.inventoryPeriod.year} (OPEN — provisoire)`
                : `${MONTHS_FR[report.inventoryPeriod.month - 1]} ${report.inventoryPeriod.year} (clôturée)`}
            </strong>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryBlock({
  report,
  branchName,
  month,
  year,
}: {
  report: FinancialReport;
  branchName: string;
  month: number;
  year: number;
}) {
  const netRev = toNumber(report.netRevenue);
  const totalExp = toNumber(report.totalExpenses);
  const netProfit = toNumber(report.netProfit);
  const netMargin = report.netMarginPercentage ? toNumber(report.netMarginPercentage) : null;
  return (
    <Card className="border-primary/30 bg-primary/[0.04]">
      <CardContent className="space-y-1 p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
          Résumé
        </p>
        <p className="text-sm leading-relaxed">
          Pour <strong>{MONTHS_FR[month - 1]} {year}</strong>
          {branchName && (
            <>
              , la succursale <strong>{branchName}</strong>
            </>
          )}{' '}
          a généré <strong>{currency.format(netRev)}</strong> en revenus nets,
          dépensé <strong>{currency.format(totalExp)}</strong>, soit un{' '}
          {netProfit >= 0 ? 'profit net' : 'déficit'} de{' '}
          <strong className={netProfit >= 0 ? 'text-primary' : 'text-destructive'}>
            {currency.format(Math.abs(netProfit))}
          </strong>
          {netMargin !== null && (
            <>
              {' '}— marge nette <strong>{netMargin.toFixed(2)} %</strong>
            </>
          )}
          .
        </p>
        {report.notes && (
          <p className="mt-3 text-xs italic text-muted-foreground">« {report.notes} »</p>
        )}
      </CardContent>
    </Card>
  );
}
