export const UserRole = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const PeriodStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type PeriodStatus = (typeof PeriodStatus)[keyof typeof PeriodStatus];

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  CLOSE_PERIOD: 'CLOSE_PERIOD',
  /** Réouverture d'une période clôturée (OWNER/ADMIN uniquement). */
  REOPEN_PERIOD: 'REOPEN_PERIOD',
  STOCK_TRANSFER: 'STOCK_TRANSFER',
  REVERSE_TRANSFER: 'REVERSE_TRANSFER',
  EXPORT: 'EXPORT',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const ExportFormat = {
  PDF: 'PDF',
  EXCEL: 'EXCEL',
  CSV: 'CSV',
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

export const CategoryType = {
  FOOD: 'FOOD',
  /** Legacy V1 binary type — kept for backwards-compat with old rows.
   *  Hidden from the category-edit dropdown so new categories can't pick
   *  it; the calc treats it as PAPER until the admin reclassifies. */
  NON_FOOD: 'NON_FOOD',
  PAPIERS: 'PAPIERS',
  NETTOYAGE: 'NETTOYAGE',
} as const;
export type CategoryType = (typeof CategoryType)[keyof typeof CategoryType];

/**
 * V2 cost family — used to ventilate `InventoryReport.realCost` into
 * Food / Paper / Cleaning. Single source of truth shared between backend
 * (close / reconcile logic) and frontend (display, badges, exports).
 */
export const CostFamily = {
  FOOD: 'FOOD',
  PAPER: 'PAPER',
  CLEANING: 'CLEANING',
} as const;
export type CostFamily = (typeof CostFamily)[keyof typeof CostFamily];

export const COST_FAMILY_LABEL: Record<CostFamily, string> = {
  FOOD: 'Food Cost',
  PAPER: 'Paper Cost',
  CLEANING: 'Cleaning Cost',
};

/**
 * Maps a Category's `categoryType` to the cost bucket it contributes to.
 *
 * Decision matrix (confirmée client) :
 *   FOOD      → FOOD
 *   PAPIERS   → PAPER
 *   NETTOYAGE → CLEANING
 *   NON_FOOD  → PAPER     (fallback temporaire — sera reclassifié manuellement)
 *   null      → PAPER     (catégorie absente : même fallback)
 *
 * Tout passage par PAPER pour cause de fallback est marqué au niveau UI
 * via un badge "à reclassifier" sur la catégorie source.
 */
export function categoryTypeToBucket(
  type: CategoryType | null | undefined,
): CostFamily {
  switch (type) {
    case CategoryType.FOOD:
      return CostFamily.FOOD;
    case CategoryType.NETTOYAGE:
      return CostFamily.CLEANING;
    case CategoryType.PAPIERS:
    case CategoryType.NON_FOOD:
    default:
      return CostFamily.PAPER;
  }
}

/** True if a category needs admin re-classification (legacy NON_FOOD or
 *  missing categoryType). The category dropdown highlights these. */
export function categoryTypeNeedsReclassification(
  type: CategoryType | null | undefined,
): boolean {
  return type === CategoryType.NON_FOOD || type == null;
}

export const ExpenseCategory = {
  ELECTRICITE: 'ELECTRICITE',
  LOYER: 'LOYER',
  INTERNET_TELEPHONE: 'INTERNET_TELEPHONE',
  ACHATS_FOURNISSEURS: 'ACHATS_FOURNISSEURS',
  EMBALLAGES: 'EMBALLAGES',
  NETTOYAGE: 'NETTOYAGE',
  MAINTENANCE: 'MAINTENANCE',
  MARKETING: 'MARKETING',
  FRAIS_BANCAIRES: 'FRAIS_BANCAIRES',
  PLATEFORMES_LIVRAISON: 'PLATEFORMES_LIVRAISON',
  /** Auto-synced from the Labor module. Excluded from financial report
   *  expense bucket because labor is counted as its own line item. */
  MAIN_DOEUVRE: 'MAIN_DOEUVRE',
  AUTRES: 'AUTRES',
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

/** Human-readable French labels for ExpenseCategory. Kept here so backend
 *  exports and frontend selects stay in sync. */
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
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

export const PaymentMethod = {
  VIREMENT: 'VIREMENT',
  CARTE: 'CARTE',
  ESPECES: 'ESPECES',
  CHEQUE: 'CHEQUE',
  PRELEVEMENT: 'PRELEVEMENT',
  AUTRE: 'AUTRE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  VIREMENT: 'Virement bancaire',
  CARTE: 'Carte bancaire',
  ESPECES: 'Espèces',
  CHEQUE: 'Chèque',
  PRELEVEMENT: 'Prélèvement',
  AUTRE: 'Autre',
};

/** Status of a monthly financial report. */
export const FinancialReportStatus = {
  DRAFT: 'DRAFT',
  LOCKED: 'LOCKED',
} as const;
export type FinancialReportStatus =
  (typeof FinancialReportStatus)[keyof typeof FinancialReportStatus];

export const FINANCIAL_REPORT_STATUS_LABEL: Record<FinancialReportStatus, string> = {
  DRAFT: 'Brouillon',
  LOCKED: 'Verrouillé',
};

/**
 * Origin of an `AccountingExpense` row.
 *
 *  - `MANUAL`    — created via the Accounting page form.
 *  - `PURCHASE`  — auto-generated 1-to-1 from a `Purchase` (the whole
 *                  invoice becomes a single accounting row carrying the
 *                  header totals). Not editable in the Accounting UI;
 *                  modify the source Purchase to change values.
 *  - `LABOR`     — auto-generated 1-to-1 from a `LaborEntry`. Total =
 *                  hours × hourlyRate; no taxes by default.
 *  - `REPAIR`    — auto-generated 1-to-1 from a `RepairEntry`. Carries
 *                  the HT / total from the repair row.
 *
 * Only MANUAL rows are fully editable. Auto rows allow notes-only edits;
 * everything else flows from the source module.
 */
export const AccountingSourceType = {
  MANUAL: 'MANUAL',
  PURCHASE: 'PURCHASE',
  LABOR: 'LABOR',
  REPAIR: 'REPAIR',
  /** Mirror auto d'un `PurchaseAdditionalCost` (essence, livraison, péage…).
   *  Chaque frais génère UNE ligne comptable avec ce sourceType et
   *  `includeInFinancialReports=true` — donc INCLUS dans le rapport
   *  financier (le filtre exclut uniquement `sourceType=PURCHASE`, pas
   *  celui-ci). Consomme automatiquement le HT via la mécanique LOT 2. */
  PURCHASE_ADDITIONAL_COST: 'PURCHASE_ADDITIONAL_COST',
} as const;
export type AccountingSourceType =
  (typeof AccountingSourceType)[keyof typeof AccountingSourceType];

export const ACCOUNTING_SOURCE_LABEL: Record<AccountingSourceType, string> = {
  MANUAL: 'Saisie manuelle',
  PURCHASE: 'Achat fournisseur',
  LABOR: 'Main-d\'œuvre',
  REPAIR: 'Réparation',
  PURCHASE_ADDITIONAL_COST: 'Frais d\'approvisionnement',
};

/** Auto-synced rows (everything except MANUAL). Used by the UI to lock
 *  the form and by the financial report to dedupe expense buckets. */
export function isAutoAccountingSource(s: AccountingSourceType): boolean {
  return s !== AccountingSourceType.MANUAL;
}

// ---------------------------------------------------------------------
// PurchaseAdditionalCost — types presets pour l'UX
// ---------------------------------------------------------------------

/** Types métier standards proposés dans le sélecteur du formulaire d'achat.
 *  La valeur stockée en DB est libre (VARCHAR(40)) — cette liste sert
 *  uniquement à guider la saisie. Personnalisation ultérieure sans
 *  migration. */
export const PurchaseAdditionalCostType = {
  ESSENCE: 'ESSENCE',
  LIVRAISON: 'LIVRAISON',
  PEAGE: 'PEAGE',
  TRANSPORT: 'TRANSPORT',
  MANUTENTION: 'MANUTENTION',
  CHAINE_DU_FROID: 'CHAINE_DU_FROID',
  DOUANE: 'DOUANE',
  AUTRE: 'AUTRE',
} as const;
export type PurchaseAdditionalCostType =
  (typeof PurchaseAdditionalCostType)[keyof typeof PurchaseAdditionalCostType];

export const PURCHASE_ADDITIONAL_COST_LABEL: Record<
  PurchaseAdditionalCostType,
  string
> = {
  ESSENCE: 'Essence',
  LIVRAISON: 'Livraison',
  PEAGE: 'Péage',
  TRANSPORT: 'Transport',
  MANUTENTION: 'Manutention',
  CHAINE_DU_FROID: 'Chaîne du froid',
  DOUANE: 'Douane',
  AUTRE: 'Autre',
};

export const StockTransferStatus = {
  COMPLETED: 'COMPLETED',
  REVERSED: 'REVERSED',
} as const;
export type StockTransferStatus = (typeof StockTransferStatus)[keyof typeof StockTransferStatus];

export const STOCK_TRANSFER_STATUS_LABEL: Record<StockTransferStatus, string> = {
  COMPLETED: 'Complété',
  REVERSED: 'Annulé',
};
