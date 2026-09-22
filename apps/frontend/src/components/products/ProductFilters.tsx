import { AlertTriangle, Search } from 'lucide-react';
import type { Category } from '@/services/categories.service';
import type { Supplier } from '@/services/suppliers.service';
import { IconInput } from '@/components/ui/icon-input';
import { CollapsibleFilters } from '@/components/ui/collapsible-filters';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  categories: Category[];
  suppliers: Supplier[];
  units: string[];
  filters: {
    search: string;
    categoryId: string;
    supplierId: string;
    unit: string;
    isActive: string;
    criticalOnly: boolean;
  };
  onChange: (next: Props['filters']) => void;
  activeCount: number;
}

const emptyFilters: Props['filters'] = {
  search: '',
  categoryId: '',
  supplierId: '',
  unit: '',
  isActive: '',
  criticalOnly: false,
};

// Radix Select forbids `value=""`. We use this sentinel for "all" and map back to "".
const ALL = '__all__';
const toSelectValue = (v: string) => (v === '' ? ALL : v);
const fromSelectValue = (v: string) => (v === ALL ? '' : v);

export function ProductFilters({ categories, suppliers, units, filters, onChange, activeCount }: Props) {
  const appliedCount =
    (filters.search !== '' ? 1 : 0) +
    (filters.categoryId !== '' ? 1 : 0) +
    (filters.supplierId !== '' ? 1 : 0) +
    (filters.unit !== '' ? 1 : 0) +
    (filters.isActive !== '' ? 1 : 0) +
    (filters.criticalOnly ? 1 : 0);
  const isDirty = appliedCount > 0;

  return (
    <CollapsibleFilters
      totalLabel={`${activeCount} produit${activeCount > 1 ? 's' : ''}`}
      activeCount={appliedCount}
      isDirty={isDirty}
      onReset={() => onChange(emptyFilters)}
    >
      {/* First row: search (wide) + category + supplier */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <IconInput
            icon={<Search className="h-4 w-4" />}
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Rechercher par nom ou SKU…"
            aria-label="Rechercher"
          />
        </div>

        <Select
          value={toSelectValue(filters.categoryId)}
          onValueChange={(v) => onChange({ ...filters, categoryId: fromSelectValue(v) })}
        >
          <SelectTrigger aria-label="Filtrer par catégorie">
            <SelectValue placeholder="Toutes les catégories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les catégories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={toSelectValue(filters.supplierId)}
          onValueChange={(v) => onChange({ ...filters, supplierId: fromSelectValue(v) })}
        >
          <SelectTrigger aria-label="Filtrer par fournisseur">
            <SelectValue placeholder="Tous les fournisseurs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les fournisseurs</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Second row: unit + status + critical toggle */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          value={toSelectValue(filters.unit)}
          onValueChange={(v) => onChange({ ...filters, unit: fromSelectValue(v) })}
        >
          <SelectTrigger aria-label="Filtrer par unité">
            <SelectValue placeholder="Toutes les unités" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les unités</SelectItem>
            {units.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={toSelectValue(filters.isActive)}
          onValueChange={(v) => onChange({ ...filters, isActive: fromSelectValue(v) })}
        >
          <SelectTrigger aria-label="Filtrer par statut">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les statuts</SelectItem>
            <SelectItem value="true">Actif</SelectItem>
            <SelectItem value="false">Inactif</SelectItem>
          </SelectContent>
        </Select>

        <div className="lg:col-span-2 flex items-center">
          <button
            type="button"
            role="switch"
            aria-checked={filters.criticalOnly}
            onClick={() => onChange({ ...filters, criticalOnly: !filters.criticalOnly })}
            className={cn(
              'group inline-flex h-10 w-full select-none items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors',
              filters.criticalOnly
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-input bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              Avec seuil min &gt; 0
            </span>
            <span
              aria-hidden
              className={cn(
                'relative inline-block h-4 w-7 rounded-full transition-colors',
                filters.criticalOnly ? 'bg-primary' : 'bg-border',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-3 w-3 rounded-full bg-background transition-transform',
                  filters.criticalOnly ? 'left-3.5' : 'left-0.5',
                )}
              />
            </span>
          </button>
        </div>
      </div>
    </CollapsibleFilters>
  );
}
