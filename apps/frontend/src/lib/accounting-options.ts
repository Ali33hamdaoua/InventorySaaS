import type { ExpenseCategory, PaymentMethod } from '@inventorymdb/shared';

/**
 * Frontend-local option lists for accounting selects.
 *
 * We don't iterate the const objects from `@inventorymdb/shared` via
 * `Object.values()` here. Reason: Vite pre-bundles the workspace package
 * once at startup, and adding new enum values to the shared dist does
 * not always trigger a re-bundle — so the const arrives as `undefined`
 * until the dev server is restarted. Local arrays survive HMR.
 *
 * The `readonly ExpenseCategory[]` annotation gives us a compile-time
 * guarantee: any rename or removal in the shared enum surfaces here.
 */

/**
 * Categories the user can pick MANUALLY in the Accounting form. Excludes:
 *  - `MAIN_DOEUVRE` — reserved for the auto-sync from the Labor module. We
 *    don't expose it in the dropdown so the user can't accidentally create
 *    a manual labor expense that would fall outside the
 *    LABOR module's source-of-truth pipeline (which would break the
 *    financial report's labor cost computation).
 *  - `ACHATS_FOURNISSEURS` is intentionally still listed for backwards-
 *    compat with legacy manual entries, even though the Purchase module
 *    auto-syncs it; the financial report excludes these from totals.
 */
export const EXPENSE_CATEGORY_OPTIONS: readonly ExpenseCategory[] = [
  'ELECTRICITE',
  'LOYER',
  'INTERNET_TELEPHONE',
  'ACHATS_FOURNISSEURS',
  'EMBALLAGES',
  'NETTOYAGE',
  'MAINTENANCE',
  'MARKETING',
  'FRAIS_BANCAIRES',
  'PLATEFORMES_LIVRAISON',
  'AUTRES',
];

export const EXPENSE_CATEGORY_LABEL_FR: Record<ExpenseCategory, string> = {
  ELECTRICITE: 'Électricité',
  LOYER: 'Loyer',
  INTERNET_TELEPHONE: 'Internet / Téléphone',
  ACHATS_FOURNISSEURS: 'Achats fournisseurs',
  EMBALLAGES: 'Emballages',
  NETTOYAGE: 'Nettoyage',
  MAINTENANCE: 'Maintenance',
  MARKETING: 'Marketing',
  FRAIS_BANCAIRES: 'Frais bancaires',
  PLATEFORMES_LIVRAISON: 'Plateformes livraison',
  MAIN_DOEUVRE: 'Main-d\'œuvre',
  AUTRES: 'Autres',
};

export const PAYMENT_METHOD_OPTIONS: readonly PaymentMethod[] = [
  'VIREMENT',
  'CARTE',
  'ESPECES',
  'CHEQUE',
  'PRELEVEMENT',
  'AUTRE',
];

export const PAYMENT_METHOD_LABEL_FR: Record<PaymentMethod, string> = {
  VIREMENT: 'Virement bancaire',
  CARTE: 'Carte bancaire',
  ESPECES: 'Espèces',
  CHEQUE: 'Chèque',
  PRELEVEMENT: 'Prélèvement',
  AUTRE: 'Autre',
};
