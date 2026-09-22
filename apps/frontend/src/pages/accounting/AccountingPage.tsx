import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt, RotateCw } from 'lucide-react';
import {
  accountingService,
  type AccountingExpense,
  type ListAccountingExpensesParams,
} from '@/services/accounting.service';
import { suppliersService } from '@/services/suppliers.service';
import { exportsService } from '@/services/exports.service';
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
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { ExportDropdownButton } from '@/components/exports/ExportDropdownButton';
import { AccountingSummaryCards } from '@/components/accounting/AccountingSummaryCards';
import {
  AccountingFilters,
  type AccountingFiltersValue,
} from '@/components/accounting/AccountingFilters';
import { AccountingExpensesTable } from '@/components/accounting/AccountingExpensesTable';
import { AccountingExpenseFormDialog } from '@/components/accounting/AccountingExpenseFormDialog';
import { AccountingDeleteDialog } from '@/components/accounting/AccountingDeleteDialog';
import { PurchaseDetailDialog } from '@/components/purchases/PurchaseDetailDialog';
import { purchasesService } from '@/services/purchases.service';
import { MONTHS_FR, monthToDateRange } from '@/lib/utils';

const PAGE_SIZES = [10, 25, 50, 100] as const;
const NOW = new Date();
const YEAR_OPTIONS = [NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1];

export default function AccountingPage() {
  const { branchId } = useActiveBranch();
  // Mois/Année driver — même UX que Purchases / Labor / Financial Reports.
  const [month, setMonth] = useState<number>(NOW.getMonth() + 1);
  const [year, setYear] = useState<number>(NOW.getFullYear());
  const [filters, setFilters] = useState<AccountingFiltersValue>({
    search: '',
    accountingCategoryId: '',
    supplierId: '',
    paymentMethod: '',
    startDate: '',
    endDate: '',
  });
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AccountingExpense | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AccountingExpense | null>(null);

  // Fetched on-demand when the user clicks "Voir l'achat" on a PURCHASE_ITEM
  // row. We don't preload purchase data into the accounting list because most
  // rows are MANUAL and don't need it.
  const [viewPurchaseId, setViewPurchaseId] = useState<string | null>(null);
  const viewPurchaseQuery = useQuery({
    queryKey: ['purchases', viewPurchaseId],
    queryFn: () => purchasesService.get(viewPurchaseId!),
    enabled: !!viewPurchaseId,
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'for-accounting'],
    queryFn: () => suppliersService.list({ includeStats: 'false' }),
    staleTime: 5 * 60_000,
  });
  const suppliers = suppliersQuery.data ?? [];

  const queryParams: ListAccountingExpensesParams = useMemo(() => {
    const p: ListAccountingExpensesParams = { page, pageSize };
    if (debouncedSearch.trim()) p.search = debouncedSearch.trim();
    if (filters.accountingCategoryId) p.accountingCategoryId = filters.accountingCategoryId;
    if (filters.supplierId) p.supplierId = filters.supplierId;
    if (filters.paymentMethod) p.paymentMethod = filters.paymentMethod;
    // Le picker Mois/Année pilote toujours la période. Le range manuel du
    // panneau filtres peut restreindre mais pas déborder du mois choisi.
    const monthRange = monthToDateRange(year, month);
    p.startDate =
      filters.startDate && filters.startDate > monthRange.startDate
        ? filters.startDate
        : monthRange.startDate;
    p.endDate =
      filters.endDate && filters.endDate < monthRange.endDate
        ? filters.endDate
        : monthRange.endDate;
    if (branchId) p.branchId = branchId;
    return p;
  }, [
    debouncedSearch,
    filters.accountingCategoryId,
    filters.supplierId,
    filters.paymentMethod,
    filters.startDate,
    filters.endDate,
    month,
    year,
    page,
    pageSize,
    branchId,
  ]);

  const expensesQuery = useQuery({
    queryKey: ['accounting', 'expenses', queryParams],
    queryFn: () => accountingService.list(queryParams),
    placeholderData: (prev) => prev,
    enabled: !!branchId,
  });

  const expenses = expensesQuery.data?.data ?? [];
  const total = expensesQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Summary uses the same period filters (no pagination, no search).
  // La query summary utilise directement le mois complet — le panneau
  // filtres n'affine que la liste, pas les KPIs mensuels.
  const summaryParams = useMemo(() => {
    const monthRange = monthToDateRange(year, month);
    return {
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      branchId: branchId ?? undefined,
    };
  }, [month, year, branchId]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (e: AccountingExpense) => {
    setEditing(e);
    setFormOpen(true);
  };
  const openDelete = (e: AccountingExpense) => {
    setDeleteTarget(e);
    setDeleteOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Comptabilité
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Dépenses comptables</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Centralisez vos dépenses mensuelles et préparez vos exports pour le comptable.
            Saisissez le montant de la dépense.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sélecteurs Mois/Année — pilotent la période de la liste + du
              résumé. Retirés du panneau filtres pour éviter un double
              contrôle contradictoire. */}
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
            onClick={() => expensesQuery.refetch()}
            disabled={expensesQuery.isFetching}
            className="gap-2"
          >
            <RotateCw
              className={`h-3.5 w-3.5 ${expensesQuery.isFetching ? 'animate-spin' : ''}`}
            />
            Actualiser
          </Button>
          <ExportDropdownButton
            disabled={total === 0}
            onExport={(format) => {
              const { page: _p, pageSize: _ps, ...exportParams } = queryParams;
              void _p;
              void _ps;
              return exportsService.accountingExpenses(format, exportParams);
            }}
          />
          <Button className="btn-brand-glow gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouvelle dépense
          </Button>
        </div>
      </header>

      <AccountingSummaryCards params={summaryParams} />

      <Card>
        <CardHeader>
          <AccountingFilters
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
          {expensesQuery.isError ? (
            <ErrorBlock
              title="Impossible de charger les dépenses"
              onRetry={() => expensesQuery.refetch()}
              retrying={expensesQuery.isFetching}
            />
          ) : !expensesQuery.isLoading && expenses.length === 0 ? (
            <EmptyState
              title="Aucune dépense pour le moment"
              description="Ajoutez vos dépenses mensuelles pour préparer l'export comptable."
              icon={<Receipt className="h-5 w-5" />}
              action={
                <Button onClick={openCreate} className="btn-brand-glow gap-2">
                  <Plus className="h-4 w-4" />
                  Nouvelle dépense
                </Button>
              }
            />
          ) : (
            <>
              <AccountingExpensesTable
                expenses={expenses}
                loading={expensesQuery.isLoading}
                onEdit={openEdit}
                onDelete={openDelete}
                onViewPurchase={setViewPurchaseId}
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
                    · {total} dépense{total > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1 || expensesQuery.isFetching}
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
                    disabled={page >= pageCount || expensesQuery.isFetching}
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

      <AccountingExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        suppliers={suppliers}
        expense={editing}
      />
      <AccountingDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        expense={deleteTarget}
      />
      {/* Source purchase preview for PURCHASE_ITEM rows. The dialog only
          renders when we have data, so a brief flash of empty content while
          the query is loading is avoided. */}
      <PurchaseDetailDialog
        open={!!viewPurchaseId && !!viewPurchaseQuery.data}
        onOpenChange={(v) => {
          if (!v) setViewPurchaseId(null);
        }}
        purchase={viewPurchaseQuery.data ?? null}
      />
    </div>
  );
}
