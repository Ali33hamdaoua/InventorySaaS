import { Search } from 'lucide-react';
import { IconInput } from '@/components/ui/icon-input';
import { CollapsibleFilters } from '@/components/ui/collapsible-filters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface SupplierFiltersValue {
  search: string;
  isActive: '' | 'true' | 'false';
}

interface Props {
  filters: SupplierFiltersValue;
  onChange: (next: SupplierFiltersValue) => void;
  totalCount: number;
}

const ALL = '__all__';
const toSel = (v: string) => (v === '' ? ALL : v);
const fromSel = (v: string) => (v === ALL ? '' : v);

const empty: SupplierFiltersValue = { search: '', isActive: '' };

export function SupplierFilters({ filters, onChange, totalCount }: Props) {
  const activeCount =
    (filters.search !== '' ? 1 : 0) + (filters.isActive !== '' ? 1 : 0);
  const isDirty = activeCount > 0;

  return (
    <CollapsibleFilters
      totalLabel={`${totalCount} fournisseur${totalCount > 1 ? 's' : ''}`}
      activeCount={activeCount}
      isDirty={isDirty}
      onReset={() => onChange(empty)}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <IconInput
            icon={<Search className="h-4 w-4" />}
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Rechercher par nom, contact, email ou téléphone…"
            aria-label="Rechercher"
          />
        </div>

        <Select
          value={toSel(filters.isActive)}
          onValueChange={(v) =>
            onChange({ ...filters, isActive: fromSel(v) as SupplierFiltersValue['isActive'] })
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
