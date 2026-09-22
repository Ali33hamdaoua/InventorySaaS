import { Calendar, Search } from 'lucide-react';
import type { Supplier } from '@/services/suppliers.service';
import { IconInput } from '@/components/ui/icon-input';
import { CollapsibleFilters } from '@/components/ui/collapsible-filters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface PurchaseFiltersValue {
  search: string;
  supplierId: string;
  startDate: string; // yyyy-mm-dd or ''
  endDate: string;
}

interface Props {
  filters: PurchaseFiltersValue;
  onChange: (next: PurchaseFiltersValue) => void;
  suppliers: Supplier[];
  totalCount: number;
}

const ALL = '__all__';
const toSel = (v: string) => (v === '' ? ALL : v);
const fromSel = (v: string) => (v === ALL ? '' : v);

const empty: PurchaseFiltersValue = {
  search: '',
  supplierId: '',
  startDate: '',
  endDate: '',
};

export function PurchaseFilters({ filters, onChange, suppliers, totalCount }: Props) {
  const activeCount =
    (filters.search !== '' ? 1 : 0) +
    (filters.supplierId !== '' ? 1 : 0) +
    (filters.startDate !== '' ? 1 : 0) +
    (filters.endDate !== '' ? 1 : 0);
  const isDirty = activeCount > 0;

  return (
    <CollapsibleFilters
      totalLabel={`${totalCount} achat${totalCount > 1 ? 's' : ''}`}
      activeCount={activeCount}
      isDirty={isDirty}
      onReset={() => onChange(empty)}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <IconInput
            icon={<Search className="h-4 w-4" />}
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Fournisseur ou note…"
            aria-label="Rechercher"
          />
        </div>

        <Select
          value={toSel(filters.supplierId)}
          onValueChange={(v) => onChange({ ...filters, supplierId: fromSel(v) })}
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

        <IconInput
          icon={<Calendar className="h-4 w-4" />}
          type="date"
          value={filters.startDate}
          onChange={(e) => onChange({ ...filters, startDate: e.target.value })}
          aria-label="Date début"
          title="Date début"
        />

        <IconInput
          icon={<Calendar className="h-4 w-4" />}
          type="date"
          value={filters.endDate}
          onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
          aria-label="Date fin"
          title="Date fin"
        />
      </div>
    </CollapsibleFilters>
  );
}
