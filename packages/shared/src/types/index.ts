import type {
  UserRole,
  PeriodStatus,
  CategoryType,
  ExpenseCategory,
  PaymentMethod,
  FinancialReportStatus,
  AccountingSourceType,
} from '../enums';

export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  categoryType: CategoryType;
  isActive: boolean;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** Result of analyzing a single Excel row for product import.
 *
 *  - `VALID`          → new product, ready to create.
 *  - `WARNING`        → will UPDATE an existing ACTIVE product with same name.
 *  - `ERROR`          → validation failed, not importable.
 *  - `INACTIVE_MATCH` → name matches an existing INACTIVE product. Requires
 *                       an explicit user decision (`IGNORE` or `REACTIVATE_AND_UPDATE`).
 *                       Default is IGNORE — no silent reactivation.
 */
export type ProductImportStatus =
  | 'VALID'
  | 'WARNING'
  | 'ERROR'
  | 'INACTIVE_MATCH';

/** Action explicite pour une ligne dont le nom matche un produit inactif.
 *  Par défaut = IGNORE (aucun changement). REACTIVATE_AND_UPDATE réactive
 *  le produit existant et met à jour ses champs autorisés. */
export type ProductImportInactiveAction = 'IGNORE' | 'REACTIVATE_AND_UPDATE';

export interface ProductImportRowIssue {
  field?: string;
  message: string;
}

/** Normalized + validated import row as returned by the preview endpoint. */
export interface ProductImportRow {
  rowNumber: number;
  /** Parsed values (already trimmed/coerced). Decimals are numbers, isActive boolean. */
  data: {
    name: string;
    category: string;
    supplier: string;
    unit: string;
    defaultCost: number;
    minStockLevel: number;
    isActive: boolean;
  };
  status: ProductImportStatus;
  errors: ProductImportRowIssue[];
  warnings: ProductImportRowIssue[];
  /** UUID of the matched category (when category lookup succeeded). */
  matchedCategoryId: string | null;
  /** UUID of the matched supplier (null if column was empty). */
  matchedSupplierId: string | null;
  /** Set when an existing product was found by name (case-insensitive within
   *  the branch) → the import will UPDATE rather than CREATE. */
  existingProductId: string | null;
  /** Set uniquement quand `status === 'INACTIVE_MATCH'`. Décrit le produit
   *  inactif correspondant. */
  inactiveMatch?: {
    productId: string;
    productName: string;
    warning: string;
    availableActions: ProductImportInactiveAction[];
  };
  /** Décision explicite envoyée par le client lors du CONFIRM. Uniquement
   *  significatif pour les lignes `INACTIVE_MATCH`. Absent = IGNORE. */
  inactiveAction?: ProductImportInactiveAction;
}

export interface ProductImportSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  createCount: number;
  updateCount: number;
  /** Nombre de lignes matchant un produit inactif (nécessitent une décision). */
  inactiveMatchRows: number;
  /** Nombre de lignes ignorées faute de décision explicite REACTIVATE. */
  ignoredCount: number;
  /** Nombre de produits inactifs réactivés + mis à jour. */
  reactivatedCount: number;
}

export interface ProductImportPreviewResponse {
  rows: ProductImportRow[];
  summary: ProductImportSummary;
}

export interface ProductImportConfirmRequest {
  /** Echo of the rows returned by `preview` — the backend re-validates. */
  rows: ProductImportRow[];
}

export interface ProductImportConfirmResponse {
  summary: ProductImportSummary;
  /** Number of rows actually persisted (created + updated). */
  importedCount: number;
}

export interface InventoryPeriodDto {
  id: string;
  branchId: string;
  month: number;
  year: number;
  status: PeriodStatus;
  openingDate: string | null;
  closingDate: string | null;
  createdAt: string;
  updatedAt: string;
  /** Live aggregates — present when the API serializes them. */
  openingValue?: string;
  purchasesValue?: string;
  closingValue?: string;
  realCost?: string;
  /** V4 ventilation : Real Cost = Food + Paper + Cleaning. */
  foodCost?: string;
  paperCost?: string;
  cleaningCost?: string;
  salesRevenue?: string | null;
  foodCostPercentage?: string | null;
  linesCount?: number;
  criticalProductsCount?: number;
  report?: {
    id: string;
    periodId: string;
    openingValue: string;
    purchasesValue: string;
    closingValue: string;
    realCost: string;
    foodCost: string;
    paperCost: string;
    cleaningCost: string;
    salesRevenue: string | null;
    foodCostPercentage: string | null;
    generatedAt: string;
  } | null;
}

export interface InventoryLineDto {
  id: string;
  periodId: string;
  productId: string;
  openingQuantity: string;
  /** Legacy snapshot column. New code reads `unitCost` instead. */
  openingUnitCost: string;
  closingQuantity: string;
  /** Legacy snapshot column. For CLOSED periods this is the frozen WAC. */
  closingUnitCost: string;
  /**
   * V3 weighted-average cost — the single per-period unit cost used by ALL
   * value computations (Valeur Fin, Consommation, etc.).
   *
   *   unitCost = Σ(PurchaseItem.qty × PurchaseItem.unitPrice)
   *            / Σ(PurchaseItem.qty)        across the period's calendar
   *                                          month, scoped to the branch.
   *
   * Fallback chain when no purchases:
   *   1. period's `closingUnitCost` (previous-period snapshot)
   *   2. period's `openingUnitCost`
   *   3. `Product.defaultCost`
   *
   * For CLOSED periods this is the frozen snapshot taken at close time —
   * backdating a purchase to a closed month does NOT shift this value.
   */
  unitCost: string;
  /** Persisted on close; while the period is OPEN, the API populates these
   *  live by aggregating purchaseItems for the month. */
  purchasesQuantity: string;
  purchasesValue: string;
  transferInQuantity: string;
  transferOutQuantity: string;
  availableQuantity: string;
  consumptionQuantity: string;
  consumptionValue: string;
  product: {
    id: string;
    /** Succursale proprietaire du produit — determine la source d'un transfert. */
    branchId: string;
    name: string;
    unit: string;
    minStockLevel: string;
    categoryId: string | null;
    category: { id: string; name: string; categoryType: CategoryType } | null;
    isActive: boolean;
    /** Packaging OPTIONNEL — pour UI dual-input dans la table Inventaire.
     *  NULL = produit unitaire (comportement historique). Ces 2 champs ne
     *  changent AUCUN calcul (Consommation, WAC, real cost, dashboard). */
    packagingName: string | null;
    packagingFactor: string | null;
  };
  /** Derived flag: closingQuantity < minStockLevel and minStockLevel > 0. */
  isCritical: boolean;
}

export interface InventoryDashboardSummary {
  /** Currently OPEN period — typically the most recent. */
  openPeriod: InventoryPeriodDto | null;
  /** Most recent CLOSED period — used to show last month's realCost. */
  lastClosedPeriod: InventoryPeriodDto | null;
  /** Count of critical lines across the OPEN period. */
  criticalProductsCount: number;
  /** Sum of non-cancelled purchases for the OPEN period (live). */
  openMonthPurchases: string;
}

export interface PurchaseItemDto {
  id: string;
  purchaseId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  product?: {
    id: string;
    name: string;
    unit: string;
    /** Exposé pour permettre à l'UI d'afficher un badge « Inactif » sur les
     *  lignes d'un ancien achat dont le produit a été désactivé depuis.
     *  Purement descriptif — aucun calcul ne consomme ce champ. */
    isActive: boolean;
  };
}

export interface PurchaseDto {
  id: string;
  branchId: string;
  supplierId: string;
  /** ISO date (yyyy-mm-dd…). */
  purchaseDate: string;
  /** Server-computed pre-tax total (= Σ line.quantity × line.unitPrice).
   *  N'INCLUT PAS les frais supplémentaires — ceux-ci sont comptabilisés
   *  séparément et n'entrent JAMAIS dans le WAC ni le food cost. */
  subtotalHT: string;
  /** Égal à `subtotalHT` (produits seuls, hors frais supplémentaires).
   *  Conservé comme champ distinct car c'est le « total facture produits »
   *  affiché dans l'UI et agrégé par les rapports. */
  totalAmount: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: {
    id: string;
    name: string;
    contactName: string | null;
  };
  items?: PurchaseItemDto[];
  /** Frais supplémentaires (essence, livraison, péage…). Chacun est
   *  comptabilisé séparément dans la comptabilité et le rapport financier
   *  (HT) sans affecter le prix des produits. */
  additionalCosts?: PurchaseAdditionalCostDto[];

  // --- Computed invoice-level totals (DTO-only, not persisted) ----------
  // These fields combine product totals with additional costs so the UI can
  // display the full supplier invoice amount. They NEVER affect inventory,
  // WAC, food cost, or any product-level calculation.

  /** Σ additionalCosts[].amountBeforeTax — pre-tax sum of all extra costs. */
  additionalCostsTotalHT?: string;
  /** Σ additionalCosts[].totalAmount — sum of all extra costs. */
  additionalCostsTotalTTC?: string;
  /** totalAmount + additionalCostsTotalTTC — the real amount paid to the
   *  supplier. Displayed as "Total facture" in the UI. */
  invoiceGrandTotal?: string;
}

/** Ligne « Frais supplémentaire » attachée à une facture d'achat. Le
 *  backend crée automatiquement une AccountingExpense miroir avec
 *  sourceType=PURCHASE_ADDITIONAL_COST et includeInFinancialReports=true. */
export interface PurchaseAdditionalCostDto {
  id: string;
  purchaseId: string;
  /** Preset code (ESSENCE/LIVRAISON/PEAGE/...) — voir enum
   *  `PurchaseAdditionalCostType`. Libre côté DB pour extensibilité. */
  costType: string;
  description: string | null;
  accountingCategoryId: string;
  amountBeforeTax: string;
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
  accountingCategory?: {
    id: string;
    name: string;
  };
}

export interface PurchaseSummaryDto {
  month: number;
  year: number;
  /** Total across purchases for the period. */
  totalAmount: string;
  /** Sum of subtotals — equal to `totalAmount`. */
  subtotalHT: string;
  purchasesCount: number;
  topSupplier: { id: string; name: string; totalAmount: string } | null;
  /** Average basket = totalAmount / purchasesCount. */
  averageBasket: string;
}

export interface SupplierDto {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  /** Only present when includeStats=true. */
  purchasesCount?: number;
  /** Sum of totalAmount across all purchases — Decimal serialized as string. */
  totalPurchasedAmount?: string;
  /** ISO date of the most recent purchase, or null when no purchases. */
  lastPurchaseDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface DashboardKpi {
  openingValue: number;
  purchasesValue: number;
  closingValue: number;
  realCost: number;
  salesRevenue: number | null;
  foodCostPercentage: number | null;
  periodId: string;
  month: number;
  year: number;
  status: PeriodStatus;
}

export interface CategoryCostBreakdown {
  categoryId: string;
  categoryName: string;
  value: number;
  percentage: number;
}

export interface TopConsumedProduct {
  productId: string;
  productName: string;
  consumptionQuantity: number;
  consumptionValue: number;
  unit: string;
}

export interface CriticalProduct {
  productId: string;
  productName: string;
  closingQuantity: number;
  minStockLevel: number;
  unit: string;
}

/**
 * Product with the highest purchasing volume during the period. Sourced
 * from PurchaseItems aggregation — NOT from sales/consumption.
 */
export interface TopPurchasedProduct {
  productId: string;
  productName: string;
  categoryName: string | null;
  unit: string;
  quantityPurchased: number;
  totalPurchasedValue: number;
}

/**
 * Product whose closing inventory count fell below its configured minimum
 * stock level. Based on the inventory line the user entered — NOT on
 * real-time stock from sales.
 */
export interface WatchProduct {
  productId: string;
  productName: string;
  closingQuantity: number;
  minStockLevel: number;
  unit: string;
}

export interface CategoryDonutItem {
  /** Either product name or supplier name depending on grouping. */
  label: string;
  value: number;
  percentage: number;
}

export interface CategoryDonut {
  totalValue: number;
  items: CategoryDonutItem[];
}

export interface CategoryDonutsResponse {
  food: CategoryDonut;
  papiers: CategoryDonut;
  nettoyage: CategoryDonut;
}

export type ReportStatus = 'OPEN_PREVIEW' | 'CLOSED_OFFICIAL';

export interface FoodCostTrendPoint {
  month: number;
  year: number;
  realCost: number;
  foodCostPercentage: number | null;
}

export interface MonthlyPurchasesPoint {
  month: number;
  year: number;
  totalAmount: number;
}

// ---------------------------------------------------------------------
// Dashboard summary (single-request payload)
// ---------------------------------------------------------------------

/** A point-in-time snapshot of a period's KPIs. */
export interface KpiSnapshot {
  periodId: string;
  month: number;
  year: number;
  status: PeriodStatus;
  openingValue: number;
  purchasesValue: number;
  closingValue: number;
  realCost: number;
  salesRevenue: number | null;
  foodCostPercentage: number | null;
}

/** Month-over-month variations (positive = increase). */
export interface KpiVariation {
  /** Percent change for realCost ((curr-prev)/prev*100). null when prev = 0/none. */
  realCostPct: number | null;
  /** Percent change for purchases. */
  purchasesPct: number | null;
  /** Percentage-points change for food cost % (curr - prev). */
  foodCostPctDelta: number | null;
  /** Percent change for closing inventory value. */
  closingValuePct: number | null;
}

export type RecommendedActionSeverity = 'info' | 'warning' | 'success';

export interface RecommendedAction {
  id: string;
  title: string;
  description: string;
  severity: RecommendedActionSeverity;
  /** Optional path the owner can navigate to. */
  ctaPath?: string;
  /** Optional CTA label. */
  ctaLabel?: string;
}

export interface DashboardFlags {
  /** Any inventory line has openingQuantity > 0. */
  hasOpeningData: boolean;
  /** Any inventory line has closingQuantity > 0. */
  hasClosingData: boolean;
  hasSalesRevenue: boolean;
  hasCriticalProducts: boolean;
  hasPurchases: boolean;
  canClose: boolean;
}

// ---------------------------------------------------------------------
// Branches (multi-location)
// ---------------------------------------------------------------------

export interface BranchDto {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Optional stats — populated when ?includeStats=true is passed to /branches. */
  usersCount?: number;
  productsCount?: number;
  purchasesCount?: number;
}

/**
 * User record as returned by /users. passwordHash is NEVER serialized.
 * `branchId` is null for OWNER (cross-branch) and may be null for ADMIN too.
 */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  branchId: string | null;
  branch: { id: string; name: string; slug: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------
// Accounting — monthly expenses for the accountant
// ---------------------------------------------------------------------

export interface AccountingCategoryDto {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingExpenseDto {
  id: string;
  /** ISO date (yyyy-mm-dd). */
  expenseDate: string;
  /** Deprecated — kept for backwards compat. The accounting form no longer
   *  exposes this field; it's null on every new row. */
  transactionDate: string | null;
  supplierId: string | null;
  supplierName: string | null;
  /** Legacy fixed-enum category. Frontend should prefer `categoryName`. */
  category: ExpenseCategory;
  /** Dynamic category id (UUID) — null only on legacy rows that failed
   *  backfill. New writes always populate this. */
  accountingCategoryId: string | null;
  /** Flattened category name — render this directly in the UI. */
  categoryName: string | null;
  accountingCategory?: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
  description: string;
  referenceNumber: string | null;
  paymentMethod: PaymentMethod | null;
  /** Decimals serialized as strings. `totalAmount` is recomputed
   *  server-side from `amountBeforeTax` on every write. */
  amountBeforeTax: string;
  totalAmount: string;
  notes: string | null;
  /** Opt-in flag for the financial report. Defaults to false for MANUAL +
   *  PURCHASE, true for REPAIR. The accountant flips it per row. */
  includeInFinancialReports: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: { id: string; name: string } | null;
  /** Where the row came from. MANUAL rows are fully editable; PURCHASE /
   *  LABOR / REPAIR rows mirror their source 1-to-1 and accept only a notes
   *  patch (everything else flows from the source module). */
  sourceType: AccountingSourceType;
  /** Set only for PURCHASE rows (1-to-1 with the source Purchase). */
  purchaseId: string | null;
  /** Set only for LABOR rows (1-to-1 with the source LaborEntry). */
  laborId: string | null;
  /** Set only for REPAIR rows (1-to-1 with the source RepairEntry). */
  repairId: string | null;
}

export interface AccountingSummaryDto {
  /** Selected period label — e.g. "Mai 2026" or "Période personnalisée". */
  selectedPeriod: string;
  totalExpenses: number;
  totalBeforeTax: number;
  expensesCount: number;
  /** Top category by total amount for the selected period. The id may be
   *  null on legacy summaries that pre-date the dynamic category table. */
  topCategory: { id: string | null; label: string; totalAmount: number } | null;
}

// ---------------------------------------------------------------------
// Financial reports — monthly P&L per branch
// ---------------------------------------------------------------------

/** Per-category expense breakdown surfaced in the report. Keys are the REAL
 *  category names (free-form, dynamic). The frontend renders them directly.
 *  Old snapshots written before the dynamic-category migration may still use
 *  enum-shaped keys (ELECTRICITE, LOYER, …) — same string-keyed shape, so
 *  the frontend just renders the key as-is. */
export type FinancialExpensesByCategory = Record<string, number>;

export interface FinancialReportDto {
  id: string;
  branchId: string;
  month: number;
  year: number;
  status: FinancialReportStatus;

  // User-entered (always live, even on LOCKED reports — but PATCHes are
  // rejected when LOCKED unless the caller is OWNER/ADMIN).
  sales: string;
  discounts: string;
  employeeMeals: string;
  tips: string;
  otherRevenue: string;
  laborCost: string;
  notes: string | null;

  // Calculated values — live on DRAFT, snapshotted on LOCKED.
  /** V4 ventilation : realCost = food + paper + cleaning. */
  foodCost: string;
  paperCost: string;
  cleaningCost: string;
  realCost: string;
  expensesByCategory: FinancialExpensesByCategory;
  totalExpenses: string;
  grossRevenue: string;
  netRevenue: string;
  grossProfit: string;
  netProfit: string;
  foodCostPercentage: string | null;
  paperCostPercentage: string | null;
  cleaningCostPercentage: string | null;
  realCostPercentage: string | null;
  netMarginPercentage: string | null;
  /** Total expenses / netRevenue × 100. Null if netRevenue ≤ 0. */
  expenseRatio: string | null;

  /** Where the inventory `foodCost` comes from — null if no closed period.
   *  When present, foodCost === InventoryReport.realCost of that period. */
  inventoryPeriod: {
    id: string;
    month: number;
    year: number;
    status: 'OPEN' | 'CLOSED';
  } | null;

  lockedAt: string | null;
  lockedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// `UpdateFinancialReportInput` is inferred from the Zod schema —
// see `schemas/financial-report.schema.ts`.

export interface DashboardSummary {
  current: KpiSnapshot;
  previous: KpiSnapshot | null;
  variation: KpiVariation;
  flags: DashboardFlags;
  /** One-paragraph plain-French summary for the owner. */
  businessSummary: string;
  recommendedActions: RecommendedAction[];
  /** Detail datasets bundled to spare round-trips. */
  trend: FoodCostTrendPoint[];
  monthlyPurchases: MonthlyPurchasesPoint[];
  categoryBreakdown: CategoryCostBreakdown[];
  topConsumed: TopConsumedProduct[];
  criticalProducts: CriticalProduct[];
}

// ---------------------------------------------------------------------
// Labor — monthly shift entries per employee
// ---------------------------------------------------------------------

export interface LaborEntryDto {
  id: string;
  branchId: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  employeeName: string;
  role: string | null;
  /** Decimals serialized as strings. */
  hours: string;
  hourlyRate: string;
  /** Always recomputed server-side from `hours × hourlyRate`. */
  totalAmount: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LaborSummaryDto {
  /** Selected period label — e.g. "Mai 2026". */
  selectedPeriod: string;
  totalHours: number;
  totalAmount: number;
  entriesCount: number;
  /** Distinct employees with at least one entry in the period. */
  employeeCount: number;
}

// ---------------------------------------------------------------------
// Repairs — equipment fixes and maintenance work
// ---------------------------------------------------------------------

/** Status of a `RepairEntry`. Aligned with the Prisma enum. */
export const RepairStatus = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
} as const;
export type RepairStatus = (typeof RepairStatus)[keyof typeof RepairStatus];

export const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  PLANNED: 'Prévu',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminé',
};

export interface RepairEntryDto {
  id: string;
  branchId: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  title: string;
  equipment: string | null;
  vendorName: string | null;
  /** Decimals serialized as strings. */
  amountBeforeTax: string;
  /** Always recomputed server-side — equal to `amountBeforeTax`. */
  totalAmount: string;
  status: RepairStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepairSummaryDto {
  selectedPeriod: string;
  totalAmount: number;
  entriesCount: number;
  countByStatus: Record<RepairStatus, number>;
}

// ---------------------------------------------------------------------
// Stock Transfers
// ---------------------------------------------------------------------

export interface StockTransferItemDto {
  id: string;
  transferId: string;
  sourceProductId: string;
  targetProductId: string;
  quantity: string;
  sourceProduct?: {
    id: string;
    name: string;
    unit: string;
  };
}

export interface StockTransferDto {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  status: 'COMPLETED' | 'REVERSED';
  createdAt: string;
  createdById: string | null;
  note: string | null;
  fromBranch?: { id: string; name: string };
  toBranch?: { id: string; name: string };
  createdBy?: { id: string; name: string };
  items: StockTransferItemDto[];
}
