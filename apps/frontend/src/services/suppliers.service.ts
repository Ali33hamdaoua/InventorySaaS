import api from '@/lib/api';
import type { SupplierDto } from '@inventorymdb/shared';

export type Supplier = SupplierDto;

export interface ListSuppliersParams {
  search?: string;
  isActive?: 'true' | 'false';
  includeStats?: 'true' | 'false';
}

export interface SupplierPayload {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export const suppliersService = {
  list: (params?: ListSuppliersParams) =>
    api.get<Supplier[]>('/suppliers', { params }).then((r) => r.data),

  get: (id: string) => api.get<Supplier>(`/suppliers/${id}`).then((r) => r.data),

  create: (data: SupplierPayload) =>
    api.post<Supplier>('/suppliers', data).then((r) => r.data),

  update: (id: string, data: Partial<SupplierPayload>) =>
    api.patch<Supplier>(`/suppliers/${id}`, data).then((r) => r.data),

  setStatus: (id: string, isActive: boolean) =>
    api.patch<Supplier>(`/suppliers/${id}/status`, { isActive }).then((r) => r.data),
};
