import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Lock,
  Save,
  RotateCw,
  ClipboardList,
  FileSpreadsheet,
  ShieldAlert,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import { Permission, useHasPermission } from '@/lib/permissions';
import {
  inventoryPeriodsService,
  type InventoryPeriod,
} from '@/services/inventory-periods.service';
import { inventoryLinesService, type InventoryLine } from '@/services/inventory-lines.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import { Skeleton } from '@/components/ui/skeleton';
import { InventoryPeriodStatusBadge } from '@/components/inventory/InventoryPeriodStatusBadge';
import { InventorySummaryPanel } from '@/components/inventory/InventorySummaryPanel';
import {
  InventoryLinesTable,
  type LineDraft,
  type LineSaveStatus,
} from '@/components/inventory/InventoryLinesTable';
import { InventoryCloseDialog } from '@/components/inventory/InventoryCloseDialog';
import { InventoryReopenDialog } from '@/components/inventory/InventoryReopenDialog';
import { StockTransferDialog } from '@/components/inventory/StockTransferDialog';
import { ExportDropdownButton } from '@/components/exports/ExportDropdownButton';
import { exportsService } from '@/services/exports.service';
import { MONTHS_FR, toNumber } from '@/lib/utils';

function lineToDraft(l: InventoryLine): LineDraft {
  return {
    productId: l.productId,
    closingQuantity: l.closingQuantity,
  };
}

function draftEquals(a: LineDraft, b: LineDraft): boolean {
  return toNumber(a.closingQuantity) === toNumber(b.closingQuantity);
}

export default function InventoryDetailPage() {
  const { periodId = '' } = useParams<{ periodId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const periodQuery = useQuery<InventoryPeriod>({
    queryKey: ['inventory-periods', periodId],
    queryFn: () => inventoryPeriodsService.get(periodId),
    enabled: !!periodId,
  });

  const linesQuery = useQuery<InventoryLine[]>({
    queryKey: ['inventory-lines', periodId],
    queryFn: () => inventoryLinesService.listByPeriod(periodId),
    enabled: !!periodId,
  });

  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [serverDrafts, setServerDrafts] = useState<Record<string, LineDraft>>({});
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [transferLine, setTransferLine] = useState<InventoryLine | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  // Per-row save status — drives the discrete inline indicator next to each
  // Fin Qté input. We deliberately avoid toast-per-save (one per Enter would
  // bury the screen during a 200-product inventory).
  const [saveStatuses, setSaveStatuses] = useState<Record<string, LineSaveStatus>>({});
  // Track pending "saved → idle" timers so we can cancel them if the user
  // edits the same row again before the green tick fades.
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Whenever the server payload arrives (or refreshes), reset both maps.
  useEffect(() => {
    if (!linesQuery.data) return;
    const next: Record<string, LineDraft> = {};
    for (const l of linesQuery.data) next[l.productId] = lineToDraft(l);
    setDrafts(next);
    setServerDrafts(next);
  }, [linesQuery.data]);

  const dirtyIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of Object.keys(drafts)) {
      const a = drafts[id]!;
      const b = serverDrafts[id];
      if (!b || !draftEquals(a, b)) set.add(id);
    }
    return set;
  }, [drafts, serverDrafts]);

  const period = periodQuery.data ?? null;
  const lines = linesQuery.data ?? [];
  const isClosed = period?.status === 'CLOSED';
  const canOverride = useHasPermission(Permission.BYPASS_CLOSED_PERIOD);
  // OWNER + ADMIN may edit a CLOSED period to fix mistakes — every save then
  // recomputes the InventoryReport server-side so the dashboard stays in sync.
  const readOnly = isClosed && !canOverride;
  const isOverrideEdit = isClosed && canOverride;

  const aggregates = useMemo(() => {
    let opening = 0;
    let closing = 0;
    let critical = 0;
    let missingCostCount = 0;
    for (const l of lines) {
      const d = drafts[l.productId];
      if (!d) continue;
      // V3 weighted-average cost — computed server-side from the period's
      // purchases. Single source of truth for both opening and closing
      // valuations (per business rule from the client).
      const unitCost = toNumber(l.unitCost);
      if (unitCost === 0) missingCostCount += 1;
      opening += toNumber(l.openingQuantity) * unitCost;
      closing += toNumber(d.closingQuantity) * unitCost;
      const minStock = toNumber(l.product.minStockLevel);
      if (minStock > 0 && toNumber(d.closingQuantity) < minStock) critical += 1;
    }
    const purchases = lines.reduce((sum, l) => sum + toNumber(l.purchasesValue), 0);
    return { opening, closing, purchases, critical, missingCostCount };
  }, [lines, drafts]);

  const saveMutation = useMutation({
    mutationFn: () => {
      // V2 counting-sheet workflow: only closingQuantity is editable. The
      // backend keeps opening/unitCost intact and recomputes consumption +
      // report (+ propagates closing→opening on N+1 if period is CLOSED).
      const payload = Array.from(dirtyIds).map((productId) => {
        const d = drafts[productId]!;
        return {
          productId,
          closingQuantity: toNumber(d.closingQuantity),
        };
      });
      return inventoryLinesService.bulk(periodId, { lines: payload });
    },
    onSuccess: () => {
      toast.success('Inventaire enregistré');
      qc.invalidateQueries({ queryKey: ['inventory-lines', periodId] });
      qc.invalidateQueries({ queryKey: ['inventory-periods'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
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
      toast.error(apiMsg || 'Échec de la sauvegarde');
    },
  });

  /**
   * Excel-style auto-save: Enter on a Fin Qté input → persist this single row.
   *
   * Design constraints:
   *  - Do NOT invalidate the whole `inventory-lines` query — that would refetch
   *    every row, replace the table, and steal focus from the next input.
   *  - Patch the row in the React Query cache instead, so React only re-renders
   *    the one row whose values changed.
   *  - Status is per-row (`saving` → `saved` → `idle`) and decays after a few
   *    seconds so a fast typer doesn't have a wall of green ticks lingering.
   *  - A failure leaves the row in the `error` state AND keeps the dirty draft
   *    intact — the next Enter will retry the save.
   */
  const handleLineSave = useCallback(
    async (productId: string): Promise<void> => {
      if (readOnly) return;
      const draft = drafts[productId];
      if (!draft) return;
      const value = toNumber(draft.closingQuantity);
      if (!Number.isFinite(value) || value < 0) {
        setSaveStatuses((s) => ({ ...s, [productId]: 'error' }));
        return;
      }
      // Cancel any pending "saved" tick fade-out for this row.
      const pending = savedTimers.current[productId];
      if (pending) {
        clearTimeout(pending);
        delete savedTimers.current[productId];
      }
      setSaveStatuses((s) => ({ ...s, [productId]: 'saving' }));
      try {
        await inventoryLinesService.upsertOne(periodId, {
          productId,
          closingQuantity: value,
        });
        // IMPORTANT: do NOT spread the upsertOne response into the cache.
        // The backend route returns the raw Prisma row whose Decimal fields
        // serialize as `{s,e,d}` objects (not the stringified shape that
        // findByPeriod produces). Patching the cache with that would render
        // `[object Object]` in the input on the next keystroke.
        //
        // The user just typed `value` and that's the authoritative new closing
        // qty — use it directly. Unit cost / consumption are derived from
        // purchases and don't change on a closing-qty edit, so leaving the
        // rest of the cached line untouched is correct.
        const normalized = String(value);
        qc.setQueryData<InventoryLine[]>(['inventory-lines', periodId], (prev) => {
          if (!prev) return prev;
          return prev.map((l) =>
            l.productId === productId ? { ...l, closingQuantity: normalized } : l,
          );
        });
        // Re-sync the server snapshot for this row so dirtyIds drops it.
        setServerDrafts((prev) => ({
          ...prev,
          [productId]: { productId, closingQuantity: normalized },
        }));
        setDrafts((prev) => ({
          ...prev,
          [productId]: { productId, closingQuantity: normalized },
        }));
        setSaveStatuses((s) => ({ ...s, [productId]: 'saved' }));
        // Aggregate views (period totals, dashboard KPIs) only need a soft
        // refresh — not the per-row query. `refetchType: 'inactive'` keeps the
        // current Inventory page's lines query untouched while still flagging
        // the dashboard for the next time it mounts.
        qc.invalidateQueries({ queryKey: ['inventory-periods'], refetchType: 'inactive' });
        qc.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'inactive' });
        savedTimers.current[productId] = setTimeout(() => {
          setSaveStatuses((s) => {
            // Only clear if still `saved` — don't stomp on a fresh `saving`.
            if (s[productId] !== 'saved') return s;
            const next = { ...s };
            delete next[productId];
            return next;
          });
          delete savedTimers.current[productId];
        }, 2500);
      } catch (e) {
        setSaveStatuses((s) => ({ ...s, [productId]: 'error' }));
        const apiMsg =
          (typeof e === 'object' &&
            e !== null &&
            'response' in e &&
            typeof (e as { response?: { data?: { message?: unknown } } }).response?.data
              ?.message === 'string' &&
            (e as { response: { data: { message: string } } }).response.data.message) ||
          null;
        // One toast per failure (cheap signal) — success path stays silent so
        // a 200-row count doesn't drown the screen.
        toast.error(apiMsg || 'Échec de la sauvegarde de la ligne');
      }
    },
    [drafts, periodId, qc, readOnly],
  );

  // Clean up any pending status-decay timers on unmount.
  useEffect(() => {
    const timers = savedTimers.current;
    return () => {
      for (const id of Object.keys(timers)) clearTimeout(timers[id]!);
    };
  }, []);

  if (periodQuery.isError) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorBlock
          title="Impossible de charger la période"
          onRetry={() => periodQuery.refetch()}
          retrying={periodQuery.isFetching}
        />
      </div>
    );
  }

  const periodLabel = period
    ? `${MONTHS_FR[period.month - 1]} ${period.year}`
    : '—';
  const dirtyCount = dirtyIds.size;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <button
            onClick={() => navigate('/inventory')}
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Toutes les périodes
          </button>
          <h1 className="text-3xl font-semibold tracking-tight">
            Inventaire — <span className="text-primary">{periodLabel}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {period ? (
              <InventoryPeriodStatusBadge status={period.status} />
            ) : (
              <Skeleton className="h-5 w-32" />
            )}
            {dirtyCount > 0 && !readOnly && (
              <Badge variant="warning" className="gap-1">
                {dirtyCount} modification{dirtyCount > 1 ? 's' : ''} non sauvegardée
                {dirtyCount > 1 ? 's' : ''}
              </Badge>
            )}
            <span>·</span>
            <span>{lines.length} produit(s)</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void periodQuery.refetch();
              void linesQuery.refetch();
            }}
            disabled={linesQuery.isFetching}
            className="gap-2"
          >
            <RotateCw
              className={`h-3.5 w-3.5 ${linesQuery.isFetching ? 'animate-spin' : ''}`}
            />
            Actualiser
          </Button>
          {/* Blank Excel sheet for the physical count — Produit / Catégorie /
              Cartons / Unités, no prices, no formulas. The user prints it
              and fills it by hand, then types totals back in this page. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void exportsService.inventoryCountTemplate(periodId);
            }}
            className="gap-2"
            title="Télécharger un Excel vierge pour le comptage physique de cette période"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Modèle de comptage
          </Button>
          <ExportDropdownButton
            disabled={lines.length === 0}
            onExport={(format) => exportsService.inventoryLines(periodId, format)}
          />
          {!readOnly && (
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={dirtyCount === 0 || saveMutation.isPending}
              className="btn-brand-glow gap-2"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending
                ? 'Enregistrement…'
                : dirtyCount > 0
                  ? `Enregistrer (${dirtyCount})`
                  : 'Enregistrer'}
            </Button>
          )}
          {!isClosed && (
            <Button
              variant="outline"
              onClick={() => setCloseOpen(true)}
              disabled={dirtyCount > 0}
              className="gap-2"
              title={dirtyCount > 0 ? 'Enregistrez vos modifications avant de clôturer' : ''}
            >
              <Lock className="h-4 w-4" />
              Clôturer
            </Button>
          )}
          {/*
            Bouton « Réouvrir » — remplace visuellement « Clôturer » quand la
            période est CLOSED, dans la même position de la toolbar. Visible
            uniquement pour OWNER/ADMIN (permission BYPASS_CLOSED_PERIOD).
            Le Manager voit toujours la card d'avertissement lecture-seule
            plus bas mais pas de bouton d'action.
          */}
          {isClosed && canOverride && (
            <Button
              variant="outline"
              onClick={() => setReopenOpen(true)}
              className="gap-2"
              title="Réouvrir cette période pour ajouter des achats rétroactifs ou corriger des quantités"
            >
              <Unlock className="h-4 w-4" />
              Réouvrir
            </Button>
          )}
        </div>
      </header>

      {isClosed && !isOverrideEdit && (
        <Card className="border-amber-500/30 bg-amber-500/[0.04]">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-medium">Période clôturée — lecture seule</p>
              <p className="text-xs text-muted-foreground">
                Les valeurs ci-dessous sont les données réconciliées au moment de la clôture.
                Seul un OWNER ou ADMIN peut modifier une période clôturée.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {aggregates.missingCostCount > 0 && !linesQuery.isLoading && (
        <Card className="border-amber-500/30 bg-amber-500/[0.04]">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-medium">
                {aggregates.missingCostCount} produit
                {aggregates.missingCostCount > 1 ? 's' : ''} sans prix unitaire
              </p>
              <p className="text-xs text-muted-foreground">
                Ces lignes ont un prix à 0 $ — soit aucun achat n'a été enregistré pour ce
                produit ce mois-ci, soit aucun coût de référence n'est défini. Les valeurs
                début / fin / consommation resteront à 0 jusqu'à ce qu'un{' '}
                <strong>achat fournisseur</strong> soit saisi (le coût moyen pondéré sera
                alors calculé automatiquement), ou qu'un <strong>coût par défaut</strong>
                soit défini sur la fiche produit pour servir de fallback.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isOverrideEdit && (
        <Card className="border-amber-500/40 bg-amber-500/[0.06]">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div className="space-y-1">
              <p className="font-medium">Mode correction — période clôturée</p>
              <p className="text-xs text-muted-foreground">
                Vous éditez une période <strong>déjà clôturée</strong>. À l'enregistrement, le
                système recalcule le rapport mensuel (valeurs début/fin, coût réel, food cost %)
                et synchronise automatiquement le mois suivant :{' '}
                <strong>closing N → opening N+1</strong>. Les achats restent figés sur le
                snapshot de clôture. Si d'autres mois (N+2, N+3) sont aussi clôturés, vérifiez
                leur cohérence manuellement.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <InventorySummaryPanel
        period={period}
        openingValue={aggregates.opening}
        closingValue={aggregates.closing}
        purchasesValue={aggregates.purchases}
        criticalCount={aggregates.critical}
        loading={periodQuery.isLoading || linesQuery.isLoading}
      />

      <Card>
        <CardHeader>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Lignes d'inventaire
          </p>
        </CardHeader>
        <CardContent>
          {linesQuery.isError ? (
            <ErrorBlock
              title="Impossible de charger les lignes"
              onRetry={() => linesQuery.refetch()}
              retrying={linesQuery.isFetching}
            />
          ) : !linesQuery.isLoading && lines.length === 0 ? (
            <EmptyState
              title="Aucune ligne d'inventaire"
              description="Les produits seront ajoutés automatiquement à la prochaine clôture ou peuvent être saisis individuellement."
              icon={<ClipboardList className="h-5 w-5" />}
            />
          ) : (
            <InventoryLinesTable
              lines={lines}
              drafts={drafts}
              dirtyIds={dirtyIds}
              onDraftChange={(productId, patch) => {
                setDrafts((prev) => ({
                  ...prev,
                  [productId]: { ...prev[productId]!, ...patch },
                }));
                // Typing on a row that just failed (or just saved) clears its
                // status so the user gets a fresh slate on the next Enter.
                setSaveStatuses((s) => {
                  if (!s[productId]) return s;
                  const next = { ...s };
                  delete next[productId];
                  return next;
                });
              }}
              onLineSave={handleLineSave}
              onTransferClick={(line) => {
                setTransferLine(line);
                setTransferOpen(true);
              }}
              saveStatuses={saveStatuses}
              readOnly={readOnly}
              loading={linesQuery.isLoading}
            />
          )}
        </CardContent>
      </Card>

      <InventoryCloseDialog open={closeOpen} onOpenChange={setCloseOpen} period={period} />
      <InventoryReopenDialog open={reopenOpen} onOpenChange={setReopenOpen} period={period} />
      <StockTransferDialog 
        open={transferOpen} 
        onOpenChange={setTransferOpen} 
        line={transferLine} 
        periodId={periodId}
        branchId={period?.branchId}
      />
    </div>
  );
}
