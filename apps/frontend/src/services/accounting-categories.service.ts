import api from '@/lib/api';
import type { AccountingCategoryDto } from '@inventorymdb/shared';

export type AccountingCategory = AccountingCategoryDto;

export const accountingCategoriesService = {
  /**
   * List every accounting category for the dropdown. Returns the dynamic
   * `accounting_categories` table — seeded on first install, extended by
   * the user every time they type a brand-new name into the expense form.
   *
   * There is no `create` endpoint by design: categories are created as a
   * side-effect of saving an expense (`categoryName` flow in
   * accountingService.create / update). Keeps the UI free of a separate
   * "manage categories" page nobody asked for.
   */
  list: () =>
    api.get<AccountingCategory[]>('/accounting/categories').then((r) => r.data),
};
