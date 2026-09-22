import { Search } from 'lucide-react';
import type { CategoryType } from '@inventorymdb/shared';
import { IconInput } from '@/components/ui/icon-input';
import { CollapsibleFilters } from '@/components/ui/collapsible-filters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface CategoryFiltersValue {
  search: string;
  categoryType: '' | CategoryType;
  isActive: '' | 'true' | 'false';
}

interface Props {
  filters: CategoryFiltersValue;
  onChange: (next: CategoryFiltersValue) => void;
  totalCount: number;
}

const ALL = '__all__';
const toSel = (v: string) => (v === '' ? ALL : v);
const fromSel = (v: string) => (v === ALL ? '' : v);

const emptyFilters: CategoryFiltersValue = {
  search: '',
  categoryType: '',
  isActive: '',
};

export function CategoryFilters({ filters, onChange, totalCount }: Props) {
  const activeCount =
    (filters.search !== '' ? 1 : 0) +
    (filters.categoryType !== '' ? 1 : 0) +
    (filters.isActive !== '' ? 1 : 0);
  const isDirty = activeCount > 0;

  return (
    <CollapsibleFilters
      totalLabel={`${totalCount} catégorie${totalCount > 1 ? 's' : ''}`}
      activeCount={activeCount}
      isDirty={isDirty}
      onReset={() => onChange(emptyFilters)}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <IconInput
            icon={<Search className="h-4 w-4" />}
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Rechercher une catégorie…"
            aria-label="Rechercher"
          />
        </div>

        <Select
          value={toSel(filters.categoryType)}
          onValueChange={(v) =>
            onChange({ ...filters, categoryType: fromSel(v) as CategoryFiltersValue['categoryType'] })
          }
        >
          <SelectTrigger aria-label="Filtrer par type">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les types</SelectItem>
            <SelectItem value="FOOD">Food</SelectItem>
            <SelectItem value="NON_FOOD">Non-food</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={toSel(filters.isActive)}
          onValueChange={(v) =>
            onChange({ ...filters, isActive: fromSel(v) as CategoryFiltersValue['isActive'] })
          }
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
      </div>
    </CollapsibleFilters>
  );
}
