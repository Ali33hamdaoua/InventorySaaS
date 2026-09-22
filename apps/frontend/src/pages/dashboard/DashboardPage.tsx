import { useQuery } from '@tanstack/react-query';
import {
  Wallet,
  ShoppingCart,
  Boxes,
  Flame,
  Percent,
  Award,
  RotateCw,
  Lock,
  Unlock,
} from 'lucide-react';
import { dashboardService } from '@/services/dashboard.service';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { KpiCard } from '@/components/charts/KpiCard';
import { FoodCostTrendChart } from '@/components/charts/FoodCostTrendChart';
import { MonthlyPurchasesChart } from '@/components/charts/MonthlyPurchasesChart';
import { ChartCard } from '@/components/charts/ChartCard';
import { CategoryDonutCard } from '@/components/dashboard/CategoryDonutCard';
import { WatchProductsList } from '@/components/dashboard/WatchProductsList';
import { TopPurchasedTable } from '@/components/dashboard/TopPurchasedTable';
import { QuickReadCard } from '@/components/dashboard/QuickReadCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBlock } from '@/components/ui/error-block';
import {
  currency,
  formatPercent,
  MONTHS_FR,
} from '@/lib/utils';

export default function DashboardPage() {
  const { branchId } = useActiveBranch();
  // Wait for the branch to resolve before firing dashboard queries so we
  // never display Joliette data under a Bishop header for a frame.
  const enabled = !!branchId;
  const scope = branchId ?? undefined;

  const summaryQ = useQuery({
    queryKey: ['dashboard', 'summary-v2', branchId],
    queryFn: () => dashboardService.summaryV2(undefined, scope),
    enabled,
  });
  const donutsQ = useQuery({
    queryKey: ['dashboard', 'category-donuts', branchId],
    queryFn: () => dashboardService.categoryDonuts(undefined, scope),
    enabled,
  });
  const topPurchasedQ = useQuery({
    queryKey: ['dashboard', 'top-purchased', branchId],
    queryFn: () => dashboardService.topPurchased(undefined, 10, scope),
    enabled,
  });
  const watchQ = useQuery({
    queryKey: ['dashboard', 'watch-products', branchId],
    queryFn: () => dashboardService.watchProducts(undefined, scope),
    enabled,
  });
  const trendQ = useQuery({
    queryKey: ['dashboard', 'trend', branchId],
    queryFn: () => dashboardService.trend(12, scope),
    enabled,
  });
  const monthlyQ = useQuery({
    queryKey: ['dashboard', 'monthly', branchId],
    queryFn: () => dashboardService.monthlyPurchases(12, scope),
    enabled,
  });

  // ---- Top-level error
  if (summaryQ.isError) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorBlock
          title="Impossible de charger le dashboard"
          description="Vérifiez votre connexion ou réessayez."
          onRetry={() => summaryQ.refetch()}
          retrying={summaryQ.isFetching}
        />
      </div>
    );
  }

  const summary = summaryQ.data;
  const isFetching =
    summaryQ.isFetching || donutsQ.isFetching || topPurchasedQ.isFetching;

  const periodLabel = summary?.activePeriod
    ? `${MONTHS_FR[summary.activePeriod.month - 1]} ${summary.activePeriod.year}`
    : '—';
  const isClosed = summary?.activePeriod?.status === 'CLOSED';

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Dashboard opérationnel
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Vue d'ensemble — <span className="text-primary">{periodLabel}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {summary ? (
              <>
                {summary.activePeriod ? (
                  isClosed ? (
                    <Badge variant="success" className="gap-1">
                      <Lock className="h-3 w-3" />
                      Période clôturée
                    </Badge>
                  ) : (
                    <Badge variant="primary" className="gap-1">
                      <Unlock className="h-3 w-3" />
                      Période ouverte
                    </Badge>
                  )
                ) : (
                  <Badge variant="outline">Aucune période</Badge>
                )}
                <Badge
                  variant={summary.reportStatus === 'CLOSED_OFFICIAL' ? 'success' : 'outline'}
                >
                  {summary.reportStatus === 'CLOSED_OFFICIAL'
                    ? 'Rapport officiel'
                    : 'Prévisualisation'}
                </Badge>
              </>
            ) : (
              <Skeleton className="h-5 w-44" />
            )}
            <span>· Suivi mensuel des achats, inventaires et coûts réels.</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void summaryQ.refetch();
              void donutsQ.refetch();
              void topPurchasedQ.refetch();
              void watchQ.refetch();
              void trendQ.refetch();
              void monthlyQ.refetch();
            }}
            disabled={isFetching}
            className="gap-2"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </header>

      {/* ===== Quick read (honest disclaimer) ===== */}
      <QuickReadCard />

      {/* ===== KPI ===== */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {summaryQ.isLoading || !summary ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)
        ) : (
          <>
            <KpiCard
              title="Début inventaire"
              value={currency.format(summary.openingValue)}
              hint="Valeur du stock au 1er du mois"
              tooltip="Σ qté × coût unitaire des lignes d'inventaire de la période."
              icon={<Wallet className="h-4 w-4" />}
            />
            <KpiCard
              title="Achats du mois"
              value={currency.format(summary.purchasesValue)}
              hint={`${summary.purchasesCount} facture${summary.purchasesCount > 1 ? 's' : ''}`}
              tooltip="Somme des factures fournisseurs non annulées de la période."
              icon={<ShoppingCart className="h-4 w-4" />}
            />
            <KpiCard
              title="Fin inventaire"
              value={currency.format(summary.closingValue)}
              hint="Valeur saisie en fin de période"
              icon={<Boxes className="h-4 w-4" />}
            />
            <KpiCard
              title="Cost réel"
              value={currency.format(summary.realCost)}
              hint="Début + Achats − Fin"
              tooltip="Cost réel = ce que vous avez réellement consommé sur la période."
              icon={<Flame className="h-4 w-4" />}
              accent
            />
            <KpiCard
              title="Food Cost %"
              value={formatPercent(summary.foodCostPercentage)}
              hint={
                summary.salesRevenue
                  ? `CA : ${currency.format(summary.salesRevenue)}`
                  : 'CA non renseigné'
              }
              tooltip="Cost réel / Chiffre d'affaires × 100. Cible saine : ≤ 30 %."
              icon={<Percent className="h-4 w-4" />}
              accent
            />
            <KpiCard
              title="Top fournisseur"
              value={summary.topSupplier?.name ?? '—'}
              hint={
                summary.topSupplier
                  ? currency.format(summary.topSupplier.totalAmount)
                  : 'Aucun achat ce mois'
              }
              icon={<Award className="h-4 w-4" />}
            />
          </>
        )}
      </section>

      {/* ===== Charts: trend + monthly purchases ===== */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Évolution du Food Cost %"
          description="12 derniers mois clôturés (rapports officiels)"
          loading={trendQ.isLoading}
          empty={!trendQ.isLoading && !!trendQ.data && trendQ.data.length === 0}
          emptyTitle="Aucun mois clôturé"
          emptyDescription="Clôturez une période pour voir apparaître la tendance."
          innerHeight={280}
        >
          {trendQ.data && <FoodCostTrendChart data={trendQ.data} />}
        </ChartCard>

        <ChartCard
          title="Achats mensuels"
          description="Total facturé par mois — hors achats annulés"
          loading={monthlyQ.isLoading}
          empty={!monthlyQ.isLoading && !!monthlyQ.data && monthlyQ.data.length === 0}
          emptyTitle="Aucun achat enregistré"
          emptyDescription="Les achats apparaîtront ici dès qu'une facture sera ajoutée."
          innerHeight={280}
        >
          {monthlyQ.data && <MonthlyPurchasesChart data={monthlyQ.data} />}
        </ChartCard>
      </section>

      {/* ===== 3 category donuts ===== */}
      <section className="grid gap-4 lg:grid-cols-3">
        <CategoryDonutCard
          title="Répartition Food"
          subtitle="Achats alimentaires du mois — par produit"
          donut={donutsQ.data?.food}
          loading={donutsQ.isLoading}
        />
        <CategoryDonutCard
          title="Répartition Papiers"
          subtitle="Emballages et consommables jetables — par produit"
          donut={donutsQ.data?.papiers}
          loading={donutsQ.isLoading}
        />
        <CategoryDonutCard
          title="Répartition Nettoyage"
          subtitle="Produits de nettoyage et hygiène — par produit"
          donut={donutsQ.data?.nettoyage}
          loading={donutsQ.isLoading}
        />
      </section>

      {/* ===== Top purchased + Watch list ===== */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TopPurchasedTable products={topPurchasedQ.data} loading={topPurchasedQ.isLoading} />
        </div>
        <WatchProductsList products={watchQ.data} loading={watchQ.isLoading} />
      </section>
    </div>
  );
}
