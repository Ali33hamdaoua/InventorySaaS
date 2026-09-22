import api from '@/lib/api';
import type {
  Paginated,
  ProductImportConfirmResponse,
  ProductImportPreviewResponse,
  ProductImportRow,
} from '@inventorymdb/shared';
import type { Category } from './categories.service';

/** A product row as returned by the API. Decimals are serialized as strings
 *  by Prisma → we keep them typed accordingly and parse on display. */
/** Minimal supplier shape returned alongside each product. */
export interface ProductSupplierRef {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  name: string;
  /** Unité de BASE (pièce, kg, L…). C'est dans cette unité que sont
   *  exprimés defaultCost, minStockLevel, et toutes les quantités DB. */
  unit: string;
  categoryId: string | null;
  category?: Category | null;
  supplierId: string | null;
  supplier?: ProductSupplierRef | null;
  defaultCost: string;
  minStockLevel: string;
  /** Nom OPTIONNEL du packaging (Carton/Box/Pack…). NULL = produit
   *  unitaire, aucune saisie « X cartons + Y unités » proposée. */
  packagingName: string | null;
  /** Nombre d'unités de base par packaging (Decimal serialisé string).
   *  NULL ↔ packagingName NULL, garanti par le backend. */
  packagingFactor: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProductSortField =
  | 'name'
  | 'category'
  | 'supplier'
  | 'defaultCost'
  | 'minStockLevel'
  | 'isActive'
  | 'createdAt';

export interface ListProductsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  supplierId?: string;
  unit?: string;
  isActive?: 'true' | 'false';
  criticalOnly?: 'true';
  sortBy?: ProductSortField;
  sortOrder?: 'asc' | 'desc';
  branchId?: string;
}

export interface ProductPayload {
  branchId?: string;
  name: string;
  unit: string;
  categoryId?: string | null;
  supplierId?: string | null;
  defaultCost: number;
  minStockLevel?: number;
  /** Nom + facteur du packaging — les deux ou aucun (validation backend). */
  packagingName?: string | null;
  packagingFactor?: number | null;
  isActive?: boolean;
  /** When true, also create a sibling row in the other active branch.
   *  Reserved to OWNER / ADMIN — backend returns 403 for MANAGER. */
  copyToOtherBranch?: boolean;
  /** Décision explicite pour la copie inter-branches : quand un homonyme
   *  INACTIF existe dans la branche cible, ce flag doit être `true` pour
   *  le réactiver + mettre à jour. Sans ce flag, la réponse est
   *  `inactive_match` et rien n'est modifié. */
  reactivateInactiveTwin?: boolean;
}

/** Outcome of the optional cross-branch mirror on `POST /products`. */
export type CrossBranchCopyStatus =
  | 'created'
  | 'alreadyExisted'
  | 'inactive_match'
  | 'reactivated'
  | 'no_other_branch';

export interface CrossBranchCopyResult {
  otherBranchName: string;
  status: CrossBranchCopyStatus;
  /** Set uniquement quand status = `inactive_match` ou `reactivated`. */
  inactiveTwin?: {
    productId: string;
    productName: string;
    targetBranchId: string;
  };
}

/** Réponse du endpoint `GET /products/:id/references`. */
export interface ProductReferences {
  purchaseItemCount: number;
  inventoryLineCount: number;
  canHardDelete: boolean;
  isActive: boolean;
}

/** Wire shape of `POST /products`. `copy` is null when `copyToOtherBranch`
 *  was false (or omitted). */
export interface CreateProductResponse {
  product: Product;
  copy: CrossBranchCopyResult | null;
}

export const productsService = {
  list: (params?: ListProductsParams) =>
    api.get<Paginated<Product>>('/products', { params }).then((r) => r.data),

  get: (id: string) => api.get<Product>(`/products/${id}`).then((r) => r.data),

  create: (data: ProductPayload) =>
    api.post<CreateProductResponse>('/products', data).then((r) => r.data),

  update: (id: string, data: Partial<ProductPayload>) =>
    api.patch<Product>(`/products/${id}`, data).then((r) => r.data),

  setStatus: (id: string, isActive: boolean) =>
    api.patch<Product>(`/products/${id}/status`, { isActive }).then((r) => r.data),

  /** Download the Excel template (triggers a browser download). */
  downloadTemplate: async () => {
    const response = await api.get<Blob>('/products/template/excel', {
      responseType: 'blob',
    });
    const blobUrl = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'template-import-produits.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  },

  previewImport: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<ProductImportPreviewResponse>('/products/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  confirmImport: (rows: ProductImportRow[], branchId?: string) =>
    api
      .post<ProductImportConfirmResponse>('/products/import/confirm', { rows, branchId })
      .then((r) => r.data),

  /** Compteurs de références historiques + verdict `canHardDelete`. */
  getReferences: (id: string) =>
    api.get<ProductReferences>(`/products/${id}/references`).then((r) => r.data),

  /** Suppression physique contrôlée (OWNER/ADMIN uniquement, produit
   *  inactif sans référence). Peut retourner 409 (encore actif, ou
   *  référencé). Distinct du DELETE standard qui est un soft-delete. */
  hardRemove: (id: string) =>
    api.delete<{ success: true }>(`/products/${id}/hard`).then((r) => r.data),
};
