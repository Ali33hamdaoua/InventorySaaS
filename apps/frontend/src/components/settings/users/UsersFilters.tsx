import { Search } from 'lucide-react';
import type { UserRole } from '@inventorymdb/shared';
import type { Branch } from '@/services/branches.service';
import { IconInput } from '@/components/ui/icon-input';
import { CollapsibleFilters } from '@/components/ui/collapsible-filters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface UsersFiltersValue {
  search: string;
  role: '' | UserRole;
  branchId: string;
  isActive: '' | 'true' | 'false';
}

interface Props {
  filters: UsersFiltersValue;
  onChange: (next: UsersFiltersValue) => void;
  branches: Branch[];
  totalCount: number;
}

const ALL = '__all__';
const toSel = (v: string) => (v === '' ? ALL : v);
const fromSel = (v: string) => (v === ALL ? '' : v);

const empty: UsersFiltersValue = {
  search: '',
  role: '',
  branchId: '',
  isActive: '',
};

export function UsersFilters({ filters, onChange, branches, totalCount }: Props) {
  const activeCount =
    (filters.search !== '' ? 1 : 0) +
    (filters.role !== '' ? 1 : 0) +
    (filters.branchId !== '' ? 1 : 0) +
    (filters.isActive !== '' ? 1 : 0);
  const isDirty = activeCount > 0;

  return (
    <CollapsibleFilters
      totalLabel={`${totalCount} utilisateur${totalCount > 1 ? 's' : ''}`}
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
            placeholder="Nom ou email…"
            aria-label="Rechercher"
          />
        </div>

        <Select
          value={toSel(filters.role)}
          onValueChange={(v) =>
            onChange({ ...filters, role: fromSel(v) as UsersFiltersValue['role'] })
          }
        >
          <SelectTrigger aria-label="Rôle">
            <SelectValue placeholder="Tous les rôles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les rôles</SelectItem>
            <SelectItem value="OWNER">Owner</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="MANAGER">Manager</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={toSel(filters.branchId)}
          onValueChange={(v) => onChange({ ...filters, branchId: fromSel(v) })}
        >
          <SelectTrigger aria-label="Succursale">
            <SelectValue placeholder="Toutes les succursales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les succursales</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={toSel(filters.isActive)}
          onValueChange={(v) =>
            onChange({
              ...filters,
              isActive: fromSel(v) as UsersFiltersValue['isActive'],
            })
          }
        >
          <SelectTrigger aria-label="Statut">
            <SelectValue placeholder="Tous statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous statuts</SelectItem>
            <SelectItem value="true">Actifs</SelectItem>
            <SelectItem value="false">Désactivés</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </CollapsibleFilters>
  );
}
