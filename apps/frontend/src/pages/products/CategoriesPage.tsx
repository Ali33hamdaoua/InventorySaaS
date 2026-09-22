import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCw, Tags } from 'lucide-react';
import type { CategoryType } from '@inventorymdb/shared';
import {
  categoriesService,
  type Category,
  type ListCategoriesParams,
} from '@/services/categories.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import { CategoryFilters, type CategoryFiltersValue } from '@/components/categories/CategoryFilters';
import { ExportDropdownButton } from '@/components/exports/ExportDropdownButton';
import { exportsService } from '@/services/exports.service';
import { CategoryTable } from '@/components/categories/CategoryTable';
import { CategoryFormDialog } from '@/components/categories/CategoryFormDialog';
import { CategoryStatusDialog } from '@/components/categories/CategoryStatusDialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function CategoriesPage() {
  const [filters, setFilters] = useState<CategoryFiltersValue>({
    search: '',
    categoryType: '',
    isActive: '',
  });
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Category | null>(null);

  const queryParams: ListCategoriesParams = useMemo(() => {
    const params: ListCategoriesParams = { includeProductCount: 'true' };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (filters.categoryType) params.categoryType = filters.categoryType as CategoryType;
    if (filters.isActive === 'true' || filters.isActive === 'false') {
      params.isActive = filters.isActive;
    }
    return params;
  }, [debouncedSearch, filters.categoryType, filters.isActive]);

  const categoriesQuery = useQuery({
    queryKey: ['categories', queryParams],
    queryFn: () => categoriesService.list(queryParams),
    placeholderData: (prev) => prev,
  });

  const categories = categoriesQuery.data ?? [];

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    setFormOpen(true);
  };
  const openStatus = (c: Category) => {
    setStatusTarget(c);
    setStatusOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Catalogue
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Catégories</h1>
          <p className="text-sm text-muted-foreground">
            Organisez vos produits par type (Food / Non-food). Les catégories sont disponibles
            dynamiquement dans Products, Purchases et le Dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => categoriesQuery.refetch()}
            disabled={categoriesQuery.isFetching}
            className="gap-2"
          >
            <RotateCw
              className={`h-3.5 w-3.5 ${categoriesQuery.isFetching ? 'animate-spin' : ''}`}
            />
            Actualiser
          </Button>
          <ExportDropdownButton
            disabled={categories.length === 0}
            onExport={(format) => exportsService.categories(format, queryParams)}
          />
          <Button className="btn-brand-glow gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouvelle catégorie
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CategoryFilters
            filters={filters}
            onChange={setFilters}
            totalCount={categories.length}
          />
        </CardHeader>
        <CardContent>
          {categoriesQuery.isError ? (
            <ErrorBlock
              title="Impossible de charger les catégories"
              onRetry={() => categoriesQuery.refetch()}
              retrying={categoriesQuery.isFetching}
            />
          ) : !categoriesQuery.isLoading && categories.length === 0 ? (
            <EmptyState
              title="Aucune catégorie ne correspond"
              description="Ajustez les filtres ou créez une nouvelle catégorie."
              icon={<Tags className="h-5 w-5" />}
              action={
                <Button onClick={openCreate} className="btn-brand-glow gap-2">
                  <Plus className="h-4 w-4" />
                  Nouvelle catégorie
                </Button>
              }
            />
          ) : (
            <CategoryTable
              categories={categories}
              loading={categoriesQuery.isLoading}
              onEdit={openEdit}
              onToggleStatus={openStatus}
            />
          )}
        </CardContent>
      </Card>

      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
      />
      <CategoryStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        category={statusTarget}
      />
    </div>
  );
}
