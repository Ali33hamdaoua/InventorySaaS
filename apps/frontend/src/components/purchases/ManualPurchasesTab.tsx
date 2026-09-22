import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCw, ShoppingCart } from 'lucide-react';
import {
  purchasesService,
  type ListPurchasesParams,
  type Purchase,
} from '@/services/purchases.service';
import { suppliersService } from '@/services/suppliers.service';
import { productsService } from '@/services/products.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PurchaseSummaryCards } from './PurchaseSummaryCards';
import { PurchaseFilters, type PurchaseFiltersValue } from './PurchaseFilters';
import { PurchaseTable } from './PurchaseTable';
import { PurchaseFormDialog } from './PurchaseFormDialog';
import { PurchaseDetailDialog } from './PurchaseDetailDialog';
import { PurchaseDeleteDialog } from './PurchaseDeleteDialog';
import { ExportDropdownButton } from '@/components/exports/ExportDropdownButton';
import { exportsService } from '@/services/exports.service';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { MONTHS_FR, monthToDateRange } from '@/lib/utils';

const PAGE_SIZES = [10, 25, 50, 100] as const;
const NOW = new Date();
const YEAR_OPTIONS = [NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1];

export function ManualPurchasesTab() {
  const { branchId } = useActiveBranch();
  // Mois/Année driver — sélecteurs primaires en haut de page, comme
  // Labor / Repairs / Financial Reports. Convertis en start/end date au
  // moment de construire la query — les autres filtres du panneau
  // (recherche, fournisseur) fonctionnent EN PLUS de la période.
  const [month, setMonth] = useState<number>(NOW.getMonth() + 1);
  const [year, setYear] = useState<number>(NOW.getFullYear());
  const [filters, setFilters] = useState<PurchaseFiltersValue>({
    search: '',
    supplierId: '',
    startDate: '',
    endDate: '',
  });
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Purchase | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);

  // Suppliers + products (branch-scoped) — needed for the form selects.
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'for-form'],
    queryFn: () => suppliersService.list({ includeStats: 'false' }),
    staleTime: 5 * 60_000,
  });
  const productsQuery = useQuery({
    // Contexte OPÉRATIONNEL : le formulaire d'achat ne doit voir que les
    // produits actifs (règle métier). Le server-side filter évite les
    // fuites dans le payload et le filtrage client fragile. L'édition d'un
    // ancien achat contenant un produit devenu inactif est gérée dans
    // PurchaseFormDialog (réinjection du produit courant).
    queryKey: ['products', 'for-form', branchId],
    queryFn: () =>
      productsService.list({
        pageSize: 200,
        sortBy: 'name',
        sortOrder: 'asc',
        isActive: 'true',
        branchId: branchId ?? undefined,
      }),
    staleTime: 5 * 60_000,
    enabled: !!branchId,
  });

  const suppliers = suppliersQuery.data ?? [];
  const products = productsQuery.data?.data ?? [];

  const queryParams: ListPurchasesParams = useMemo(() => {
    const params: ListPurchasesParams = {
      page,
      pageSize,
      includeItems: 'true',
    };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (filters.supplierId) params.supplierId = filters.supplierId;
    // Le picker Mois/Année pilote toujours la période. Le range manuel
    // dans le filtre panel (startDate/endDate) peut le RESTREINDRE mais
    // pas l'étendre — utile si l'utilisateur veut isoler une semaine.
    const monthRange = monthToDateRange(year, month);
    params.startDate =
      filters.startDate && filters.startDate > monthRange.startDate
        ? filters.startDate
        : monthRange.startDate;
    params.endDate =
      filters.endDate && filters.endDate < monthRange.endDate
        ? filters.endDate
        : monthRange.endDate;
    if (branchId) params.branchId = branchId;
    return params;
  }, [
    debouncedSearch,
    filters.supplierId,
    filters.startDate,
    filters.endDate,
    month,
    year,
    page,
    pageSize,
    branchId,
  ]);

  const purchasesQuery = useQuery({
    queryKey: ['purchases', queryParams],
    queryFn: () => purchasesService.list(queryParams),
    placeholderData: (prev) => prev,
    enabled: !!branchId,
  });

  const purchases = purchasesQuery.data?.data ?? [];
  const total = purchasesQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: Purchase) => {
    setEditing(p);
    setFormOpen(true);
  };
  const openDetail = (p: Purchase) => {
    setDetail(p);
    setDetailOpen(true);
  };
  const openDelete = (p: Purchase) => {
    setDeleteTarget(p);
    setDeleteOpen(true);
  };

  return (
    <div className="space-y-6">
      <PurchaseSummaryCards />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Sélecteurs de période — même pattern que Labor / Repairs /
            Financial Reports pour une expérience cohérente à travers le
            logiciel. Change → refetch automatique via la queryKey. */}
        <Select
          value={String(month)}
          onValueChange={(v) => {
            setMonth(Number(v));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32" aria-label="Mois">
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
        <Select
          value={String(year)}
          onValueChange={(v) => {
            setYear(Number(v));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-24" aria-label="Année">
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
        <div className="mx-1 hidden h-6 w-px bg-border/60 lg:block" aria-hidden />
        <Button
          variant="outline"
          size="sm"
          onClick={() => purchasesQuery.refetch()}
          disabled={purchasesQuery.isFetching}
          className="gap-2"
        >
          <RotateCw
            className={`h-3.5 w-3.5 ${purchasesQuery.isFetching ? 'animate-spin' : ''}`}
          />
          Actualiser
        </Button>
        <ExportDropdownButton
          disabled={total === 0}
          onExport={(format) => {
            const { page: _p, pageSize: _ps, includeItems: _it, ...exportParams } = queryParams;
            void _p;
            void _ps;
            void _it;
            return exportsService.purchases(format, exportParams);
          }}
        />
        <Button className="btn-brand-glow gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nouvel achat
        </Button>
      </div>

      <Card>
        <CardHeader>
          <PurchaseFilters
            filters={filters}
            onChange={(next) => {
              setFilters(next);
              setPage(1);
            }}
            suppliers={suppliers}
            totalCount={total}
          />
        </CardHeader>
        <CardContent>
          {purchasesQuery.isError ? (
            <ErrorBlock
              title="Impossible de charger les achats"
              onRetry={() => purchasesQuery.refetch()}
              retrying={purchasesQuery.isFetching}
            />
          ) : !purchasesQuery.isLoading && purchases.length === 0 ? (
            <EmptyState
              title="Aucun achat enregistré"
              description="Saisissez votre premier achat fournisseur pour démarrer le suivi."
              icon={<ShoppingCart className="h-5 w-5" />}
              action={
                <Button onClick={openCreate} className="btn-brand-glow gap-2">
                  <Plus className="h-4 w-4" />
                  Nouvel achat
                </Button>
              }
            />
          ) : (
            <>
              <PurchaseTable
                purchases={purchases}
                loading={purchasesQuery.isLoading}
                onView={openDetail}
                onEdit={openEdit}
                onDelete={openDelete}
              />

              <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground sm:flex-row">
                <div className="flex items-center gap-2">
                  <span>Lignes :</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-20" aria-label="Lignes par page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((s) => (
                        <SelectItem key={s} value={String(s)}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>
                    · {total} achat{total > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1 || purchasesQuery.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Précédent
                  </Button>
                  <span className="tabular-nums">
                    Page {page} / {pageCount}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= pageCount || purchasesQuery.isFetching}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Suivant →
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <PurchaseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        suppliers={suppliers}
        products={products}
        purchase={editing}
      />
      <PurchaseDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        purchase={detail}
      />
      <PurchaseDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        purchase={deleteTarget}
      />
    </div>
  );
}
