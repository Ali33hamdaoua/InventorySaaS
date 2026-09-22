import { Calendar, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { PaymentMethod } from '@inventorymdb/shared';
import {
  PAYMENT_METHOD_LABEL_FR,
  PAYMENT_METHOD_OPTIONS,
} from '@/lib/accounting-options';
import type { Supplier } from '@/services/suppliers.service';
import { accountingCategoriesService } from '@/services/accounting-categories.service';
import { IconInput } from '@/components/ui/icon-input';
import { CollapsibleFilters } from '@/components/ui/collapsible-filters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface AccountingFiltersValue {
  search: string;
  /** Dynamic category id (UUID). Replaces the previous enum-based filter. */
  accountingCategoryId: string;
  supplierId: string;
  paymentMethod: '' | PaymentMethod;
  startDate: string;
  endDate: string;
}

interface Props {
  filters: AccountingFiltersValue;
  onChange: (next: AccountingFiltersValue) => void;
  suppliers: Supplier[];
  totalCount: number;
}

const ALL = '__all__';
const toSel = (v: string) => (v === '' ? ALL : v);
const fromSel = (v: string) => (v === ALL ? '' : v);

const empty: AccountingFiltersValue = {
  search: '',
  accountingCategoryId: '',
  supplierId: '',
  paymentMethod: '',
  startDate: '',
  endDate: '',
};

export function AccountingFilters({ filters, onChange, suppliers, totalCount }: Props) {
  const categoriesQuery = useQuery({
    queryKey: ['accounting-categories'],
    queryFn: accountingCategoriesService.list,
    staleTime: 60_000,
  });
  const categories = categoriesQuery.data ?? [];

  const activeCount =
    (filters.search !== '' ? 1 : 0) +
    (filters.accountingCategoryId !== '' ? 1 : 0) +
    (filters.supplierId !== '' ? 1 : 0) +
    (filters.paymentMethod !== '' ? 1 : 0) +
    (filters.startDate !== '' ? 1 : 0) +
    (filters.endDate !== '' ? 1 : 0);
  const isDirty = activeCount > 0;

  return (
    <CollapsibleFilters
      totalLabel={`${totalCount} dépense${totalCount > 1 ? 's' : ''}`}
      activeCount={activeCount}
      isDirty={isDirty}
      onReset={() => onChange(empty)}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <IconInput
            icon={<Search className="h-4 w-4" />}
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Description, fournisseur, n° facture…"
            aria-label="Rechercher"
          />
        </div>

        {/*
          Category dropdown built from the dynamic `accounting_categories`
          table. Falls back to "Toutes les catégories" while the list loads
          (no spinner — the query is cached for 60 s so the second open is
          instant).
        */}
        <Select
          value={toSel(filters.accountingCategoryId)}
          onValueChange={(v) =>
            onChange({ ...filters, accountingCategoryId: fromSel(v) })
          }
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
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <Select
          value={toSel(filters.paymentMethod)}
          onValueChange={(v) =>
            onChange({
              ...filters,
              paymentMethod: fromSel(v) as AccountingFiltersValue['paymentMethod'],
            })
          }
        >
          <SelectTrigger aria-label="Mode de paiement">
            <SelectValue placeholder="Tous les modes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les modes</SelectItem>
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <SelectItem key={m} value={m}>
                {PAYMENT_METHOD_LABEL_FR[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </CollapsibleFilters>
  );
}
