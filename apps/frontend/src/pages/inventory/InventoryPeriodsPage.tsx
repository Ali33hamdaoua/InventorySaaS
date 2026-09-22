import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { RotateCw, ClipboardList, ArrowRight, Lock, Sparkles } from 'lucide-react';
import type { PeriodStatus } from '@inventorymdb/shared';
import {
  inventoryPeriodsService,
  type InventoryPeriod,
} from '@/services/inventory-periods.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InventoryPeriodSummaryCards } from '@/components/inventory/InventoryPeriodSummaryCards';
import { InventoryPeriodsTable } from '@/components/inventory/InventoryPeriodsTable';
import { InventoryCloseDialog } from '@/components/inventory/InventoryCloseDialog';
import { BootstrapInventoryDialog } from '@/components/inventory/BootstrapInventoryDialog';
import { ExportDropdownButton } from '@/components/exports/ExportDropdownButton';
import { exportsService } from '@/services/exports.service';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { currency, MONTHS_FR, toNumber } from '@/lib/utils';

const ALL = '__all__';

export default function InventoryPeriodsPage() {
  const { branchId } = useActiveBranch();
  const [statusFilter, setStatusFilter] = useState<'' | PeriodStatus>('');

  const [bootstrapOpen, setBootstrapOpen] = useState(false);

  const [closeOpen, setCloseOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<InventoryPeriod | null>(null);

  const params = useMemo(
    () => ({
      ...(statusFilter ? { status: statusFilter as PeriodStatus } : {}),
      ...(branchId ? { branchId } : {}),
    }),
    [statusFilter, branchId],
  );

  const query = useQuery({
    queryKey: ['inventory-periods', 'list', params],
    queryFn: () => inventoryPeriodsService.list(params),
    enabled: !!branchId,
  });

  const periods = query.data ?? [];
  const openPeriod = useMemo(() => periods.find((p) => p.status === 'OPEN') ?? null, [periods]);

  const openClose = (p: InventoryPeriod) => {
    setCloseTarget(p);
    setCloseOpen(true);
  };

  const noPeriodsAtAll =
    !query.isLoading && periods.length === 0 && statusFilter === '';

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Inventaire mensuel
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Périodes d'inventaire</h1>
          <p className="text-sm text-muted-foreground">
            La période en cours est mise en avant. À la clôture, le mois suivant est créé
            automatiquement et les quantités finales deviennent les quantités de début.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="gap-2"
          >
            <RotateCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <ExportDropdownButton
            disabled={periods.length === 0}
            onExport={(format) =>
              exportsService.inventoryPeriods(format, statusFilter ? { status: statusFilter } : undefined)
            }
          />
        </div>
      </header>

      <InventoryPeriodSummaryCards />

      {openPeriod && <OpenPeriodHero period={openPeriod} onClose={() => openClose(openPeriod)} />}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Historique
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Select
                value={statusFilter === '' ? ALL : statusFilter}
                onValueChange={(v) => setStatusFilter(v === ALL ? '' : (v as PeriodStatus))}
              >
                <SelectTrigger className="h-8 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tous les statuts</SelectItem>
                  <SelectItem value="OPEN">Période ouverte</SelectItem>
                  <SelectItem value="CLOSED">Périodes clôturées</SelectItem>
                </SelectContent>
              </Select>
              <span className="tabular-nums">{periods.length} période(s)</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {query.isError ? (
            <ErrorBlock
              title="Impossible de charger les périodes"
              onRetry={() => query.refetch()}
              retrying={query.isFetching}
            />
          ) : noPeriodsAtAll ? (
            <EmptyState
              title="Aucune période d'inventaire"
              description="Initialisez l'inventaire une seule fois pour cette succursale. Le système gérera ensuite chaque mois automatiquement à chaque clôture."
              icon={<ClipboardList className="h-5 w-5" />}
              action={
                <Button onClick={() => setBootstrapOpen(true)} className="btn-brand-glow gap-2">
                  <Sparkles className="h-4 w-4" />
                  Initialiser l'inventaire
                </Button>
              }
            />
          ) : (
            <InventoryPeriodsTable
              periods={periods}
              loading={query.isLoading}
              onClose={openClose}
            />
          )}
        </CardContent>
      </Card>

      <BootstrapInventoryDialog open={bootstrapOpen} onOpenChange={setBootstrapOpen} />
      <InventoryCloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        period={closeTarget}
      />
    </div>
  );
}

function OpenPeriodHero({ period, onClose }: { period: InventoryPeriod; onClose: () => void }) {
  const label = `${MONTHS_FR[period.month - 1]} ${period.year}`;
  const opening = toNumber(period.openingValue ?? 0);
  const purchases = toNumber(period.purchasesValue ?? 0);
  const closing = toNumber(period.closingValue ?? 0);
  const realCost = toNumber(period.realCost ?? 0);
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/50 text-primary">
              Période en cours
            </Badge>
            <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Saisissez vos quantités de fin de mois
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{label}</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              Début <span className="text-foreground/80 tabular-nums">{currency.format(opening)}</span>
            </span>
            <span>
              Achats <span className="text-foreground/80 tabular-nums">{currency.format(purchases)}</span>
            </span>
            <span>
              Fin <span className="text-foreground/80 tabular-nums">{currency.format(closing)}</span>
            </span>
            <span>
              Coût réel <span className="font-medium text-primary tabular-nums">{currency.format(realCost)}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/inventory/${period.id}`}>
            <Button variant="outline" className="gap-2">
              <ArrowRight className="h-4 w-4" />
              Saisir l'inventaire
            </Button>
          </Link>
          <Button className="btn-brand-glow gap-2" onClick={onClose}>
            <Lock className="h-4 w-4" />
            Clôturer {label}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
