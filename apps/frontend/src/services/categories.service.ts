import api from '@/lib/api';
import type { CategoryType } from '@inventorymdb/shared';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  categoryType: CategoryType;
  isActive: boolean;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListCategoriesParams {
  search?: string;
  categoryType?: CategoryType;
  isActive?: 'true' | 'false';
  includeProductCount?: 'true' | 'false';
}

export interface CategoryPayload {
  name: string;
  description?: string | null;
  categoryType?: CategoryType;
  isActive?: boolean;
}

export const categoriesService = {
  list: (params?: ListCategoriesParams) =>
    api.get<Category[]>('/categories', { params }).then((r) => r.data),

  get: (id: string) => api.get<Category>(`/categories/${id}`).then((r) => r.data),

  create: (data: CategoryPayload) =>
    api.post<Category>('/categories', data).then((r) => r.data),

  update: (id: string, data: Partial<CategoryPayload>) =>
    api.patch<Category>(`/categories/${id}`, data).then((r) => r.data),

  setStatus: (id: string, isActive: boolean) =>
    api.patch<Category>(`/categories/${id}/status`, { isActive }).then((r) => r.data),
};
