import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Plus, RotateCw, Upload } from 'lucide-react';
import {
  productsService,
  type ListProductsParams,
  type Product,
  type ProductSortField,
} from '@/services/products.service';
import { categoriesService } from '@/services/categories.service';
import { suppliersService } from '@/services/suppliers.service';
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
import { ProductFilters } from '@/components/products/ProductFilters';
import { ExportDropdownButton } from '@/components/exports/ExportDropdownButton';
import { exportsService } from '@/services/exports.service';
import { ProductTable } from '@/components/products/ProductTable';
import { ProductFormDialog } from '@/components/products/ProductFormDialog';
import { ProductStatusDialog } from '@/components/products/ProductStatusDialog';
import { ProductDeleteDialog } from '@/components/products/ProductDeleteDialog';
import { ProductImportDialog } from '@/components/products/import/ProductImportDialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useActiveBranch } from '@/hooks/useActiveBranch';
import { useAuthStore } from '@/stores/auth.store';
import { canAccessAllBranches } from '@inventorymdb/shared';

const PAGE_SIZES = [10, 25, 50, 100] as const;

export default function ProductsPage() {
  const { branchId } = useActiveBranch();

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    supplierId: '',
    unit: '',
    isActive: '',
    criticalOnly: false,
  });
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const [sortBy, setSortBy] = useState<ProductSortField>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Product | null>(null);

  // Suppression PHYSIQUE : réservée OWNER/ADMIN via `canAccessAllBranches`
  // (règle métier validée — même prédicat que pour la copie inter-branches).
  const role = useAuthStore((s) => s.user?.role ?? null);
  const canHardDelete = canAccessAllBranches(role);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const [importOpen, setImportOpen] = useState(false);

  // Categories + suppliers (for filters + form)
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesService.list(),
    staleTime: 5 * 60_000,
  });
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'for-product-form'],
    queryFn: () => suppliersService.list({ includeStats: 'false' }),
    staleTime: 5 * 60_000,
  });

  // Products (server-side filter/sort/paginate)
  const queryParams: ListProductsParams = useMemo(() => {
    const params: ListProductsParams = { page, pageSize, sortBy, sortOrder };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (filters.categoryId) params.categoryId = filters.categoryId;
    if (filters.supplierId) params.supplierId = filters.supplierId;
    if (filters.unit) params.unit = filters.unit;
    if (filters.isActive === 'true' || filters.isActive === 'false') {
      params.isActive = filters.isActive;
    }
    if (filters.criticalOnly) params.criticalOnly = 'true';
    if (branchId) params.branchId = branchId;
    return params;
  }, [
    debouncedSearch,
    filters.categoryId,
    filters.supplierId,
    filters.unit,
    filters.isActive,
    filters.criticalOnly,
    page,
    pageSize,
    sortBy,
    sortOrder,
    branchId,
  ]);

  const productsQuery = useQuery({
    queryKey: ['products', queryParams],
    queryFn: () => productsService.list(queryParams),
    placeholderData: (prev) => prev,
    enabled: !!branchId,
  });

  const products = productsQuery.data?.data ?? [];
  const total = productsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const categories = categoriesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const units = useMemo(() => {
    const set = new Set<string>(products.map((p) => p.unit));
    ['kg', 'g', 'L', 'ml', 'unit', 'box', 'pack', 'bag'].forEach((u) => set.add(u));
    return Array.from(set).sort();
  }, [products]);

  const handleSortChange = (field: ProductSortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setFormOpen(true);
  };
  const openStatus = (p: Product) => {
    setStatusTarget(p);
    setStatusOpen(true);
  };
  const openHardDelete = (p: Product) => {
    setDeleteTarget(p);
    setDeleteOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Catalogue
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Produits d'inventaire</h1>
          <p className="text-sm text-muted-foreground">
            Gérez les ingrédients, emballages et consommables. Les produits seed La Maison du Burger
            restent modifiables pour la démo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => productsQuery.refetch()}
            disabled={productsQuery.isFetching}
            className="gap-2"
          >
            <RotateCw
              className={`h-3.5 w-3.5 ${productsQuery.isFetching ? 'animate-spin' : ''}`}
            />
            Actualiser
          </Button>
          <ExportDropdownButton
            disabled={total === 0}
            onExport={(format) => {
              const { page: _p, pageSize: _ps, ...exportParams } = queryParams;
              void _p;
              void _ps;
              return exportsService.products(format, exportParams);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="gap-2"
          >
            <Upload className="h-3.5 w-3.5" />
            Importer
          </Button>
          <Button className="btn-brand-glow gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouveau produit
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <ProductFilters
            categories={categories}
            suppliers={suppliers}
            units={units}
            filters={filters}
            onChange={(next) => {
              setFilters(next);
              setPage(1);
            }}
            activeCount={total}
          />
        </CardHeader>
        <CardContent>
          {productsQuery.isError ? (
            <ErrorBlock
              title="Impossible de charger les produits"
              onRetry={() => productsQuery.refetch()}
              retrying={productsQuery.isFetching}
            />
          ) : !productsQuery.isLoading && products.length === 0 ? (
            <EmptyState
              title="Aucun produit ne correspond"
              description="Ajustez les filtres ou créez un nouveau produit pour démarrer."
              icon={<Package className="h-5 w-5" />}
              action={
                <Button onClick={openCreate} className="btn-brand-glow gap-2">
                  <Plus className="h-4 w-4" />
                  Nouveau produit
                </Button>
              }
            />
          ) : (
            <>
              <ProductTable
                products={products}
                loading={productsQuery.isLoading}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={handleSortChange}
                onEdit={openEdit}
                onToggleStatus={openStatus}
                onHardDelete={canHardDelete ? openHardDelete : undefined}
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
                    · {total} produit{total > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1 || productsQuery.isFetching}
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
                    disabled={page >= pageCount || productsQuery.isFetching}
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

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        suppliers={suppliers}
        product={editing}
      />
      <ProductImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ProductStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        product={statusTarget}
      />
      <ProductDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        product={deleteTarget}
      />
    </div>
  );
}
