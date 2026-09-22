import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCw, Truck } from 'lucide-react';
import {
  suppliersService,
  type Supplier,
  type ListSuppliersParams,
} from '@/services/suppliers.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import { SupplierFilters, type SupplierFiltersValue } from '@/components/suppliers/SupplierFilters';
import { SupplierTable } from '@/components/suppliers/SupplierTable';
import { SupplierFormDialog } from '@/components/suppliers/SupplierFormDialog';
import { SupplierStatusDialog } from '@/components/suppliers/SupplierStatusDialog';
import { SupplierSummaryCards } from '@/components/suppliers/SupplierSummaryCards';
import { ExportDropdownButton } from '@/components/exports/ExportDropdownButton';
import { exportsService } from '@/services/exports.service';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function SuppliersPage() {
  const [filters, setFilters] = useState<SupplierFiltersValue>({
    search: '',
    isActive: '',
  });
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Supplier | null>(null);

  const queryParams: ListSuppliersParams = useMemo(() => {
    const params: ListSuppliersParams = { includeStats: 'true' };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (filters.isActive === 'true' || filters.isActive === 'false') {
      params.isActive = filters.isActive;
    }
    return params;
  }, [debouncedSearch, filters.isActive]);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', queryParams],
    queryFn: () => suppliersService.list(queryParams),
    placeholderData: (prev) => prev,
  });

  // Separate query for the top-bar summary cards — always reflects the
  // overall situation, independent of search filters applied to the table.
  const summaryQuery = useQuery({
    queryKey: ['suppliers', 'summary'],
    queryFn: () => suppliersService.list({ includeStats: 'true' }),
  });

  const suppliers = suppliersQuery.data ?? [];

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setFormOpen(true);
  };
  const openStatus = (s: Supplier) => {
    setStatusTarget(s);
    setStatusOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Approvisionnement
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Fournisseurs</h1>
          <p className="text-sm text-muted-foreground">
            Gérez vos partenaires d'approvisionnement et suivez l'historique des achats par
            fournisseur.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void suppliersQuery.refetch();
              void summaryQuery.refetch();
            }}
            disabled={suppliersQuery.isFetching}
            className="gap-2"
          >
            <RotateCw
              className={`h-3.5 w-3.5 ${suppliersQuery.isFetching ? 'animate-spin' : ''}`}
            />
            Actualiser
          </Button>
          <ExportDropdownButton
            disabled={suppliers.length === 0}
            onExport={(format) => exportsService.suppliers(format, queryParams)}
          />
          <Button className="btn-brand-glow gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouveau fournisseur
          </Button>
        </div>
      </header>

      <SupplierSummaryCards
        suppliers={summaryQuery.data ?? []}
        loading={summaryQuery.isLoading}
      />

      <Card>
        <CardHeader>
          <SupplierFilters
            filters={filters}
            onChange={setFilters}
            totalCount={suppliers.length}
          />
        </CardHeader>
        <CardContent>
          {suppliersQuery.isError ? (
            <ErrorBlock
              title="Impossible de charger les fournisseurs"
              onRetry={() => suppliersQuery.refetch()}
              retrying={suppliersQuery.isFetching}
            />
          ) : !suppliersQuery.isLoading && suppliers.length === 0 ? (
            <EmptyState
              title="Aucun fournisseur ne correspond"
              description="Ajustez les filtres ou créez un nouveau fournisseur."
              icon={<Truck className="h-5 w-5" />}
              action={
                <Button onClick={openCreate} className="btn-brand-glow gap-2">
                  <Plus className="h-4 w-4" />
                  Nouveau fournisseur
                </Button>
              }
            />
          ) : (
            <SupplierTable
              suppliers={suppliers}
              loading={suppliersQuery.isLoading}
              onEdit={openEdit}
              onToggleStatus={openStatus}
            />
          )}
        </CardContent>
      </Card>

      <SupplierFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        supplier={editing}
      />
      <SupplierStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        supplier={statusTarget}
      />
    </div>
  );
}
