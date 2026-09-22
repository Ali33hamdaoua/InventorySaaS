import { UserRole } from '../enums';

/**
 * Single source of truth for what each role can do.
 *
 * Business rule (V1):
 *   - OWNER  = full access (operations + settings)
 *   - ADMIN  = full operational access, NO settings
 *   - MANAGER = full operational access, NO settings, NO closed-period bypass
 *
 * Used by:
 *   - backend `PermissionsGuard` (authoritative)
 *   - frontend sidebar / route guards / conditional UI
 *
 * Add new capabilities here, then reference `Permission.X` from both sides —
 * never branch on `role === ...` directly in feature code.
 */
export enum Permission {
  // Settings — exclusively OWNER.
  ACCESS_SETTINGS = 'access:settings',
  MANAGE_USERS = 'manage:users',
  MANAGE_BRANCHES = 'manage:branches',
  VIEW_AUDIT_LOGS = 'view:audit_logs',

  // Business operations — every role.
  VIEW_DASHBOARD = 'view:dashboard',
  MANAGE_PRODUCTS = 'manage:products',
  MANAGE_CATEGORIES = 'manage:categories',
  MANAGE_SUPPLIERS = 'manage:suppliers',
  MANAGE_PURCHASES = 'manage:purchases',
  MANAGE_INVENTORY = 'manage:inventory',
  MANAGE_ACCOUNTING = 'manage:accounting',
  MANAGE_FINANCIAL_REPORTS = 'manage:financial_reports',
  MANAGE_LABOR = 'manage:labor',
  MANAGE_REPAIRS = 'manage:repairs',
  MANAGE_TRANSFERS = 'manage:transfers',
  EXPORT_DATA = 'export:data',

  // Privileged operations — OWNER + ADMIN (cross-branch reads, override locks).
  CROSS_BRANCH_ACCESS = 'access:cross_branch',
  BYPASS_CLOSED_PERIOD = 'bypass:closed_period',
  /** Manual creation of an inventory period (admin override — the normal
   *  flow is bootstrap once + auto-create on each close). */
  OVERRIDE_INVENTORY_PERIOD = 'override:inventory_period',
  /** Lock / unlock a monthly financial report (admin override on LOCKED). */
  LOCK_FINANCIAL_REPORT = 'lock:financial_report',
}

const SETTINGS_PERMISSIONS: readonly Permission[] = [
  Permission.ACCESS_SETTINGS,
  Permission.MANAGE_USERS,
  Permission.MANAGE_BRANCHES,
  Permission.VIEW_AUDIT_LOGS,
];

const OPERATION_PERMISSIONS: readonly Permission[] = [
  Permission.VIEW_DASHBOARD,
  Permission.MANAGE_PRODUCTS,
  Permission.MANAGE_CATEGORIES,
  Permission.MANAGE_SUPPLIERS,
  Permission.MANAGE_PURCHASES,
  Permission.MANAGE_INVENTORY,
  Permission.MANAGE_ACCOUNTING,
  Permission.MANAGE_FINANCIAL_REPORTS,
  Permission.MANAGE_LABOR,
  Permission.MANAGE_REPAIRS,
  Permission.MANAGE_TRANSFERS,
  Permission.EXPORT_DATA,
];

const PRIVILEGED_PERMISSIONS: readonly Permission[] = [
  Permission.CROSS_BRANCH_ACCESS,
  Permission.BYPASS_CLOSED_PERIOD,
  Permission.OVERRIDE_INVENTORY_PERIOD,
  Permission.LOCK_FINANCIAL_REPORT,
];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  [UserRole.OWNER]: [
    ...SETTINGS_PERMISSIONS,
    ...OPERATION_PERMISSIONS,
    ...PRIVILEGED_PERMISSIONS,
  ],
  [UserRole.ADMIN]: [...OPERATION_PERMISSIONS, ...PRIVILEGED_PERMISSIONS],
  [UserRole.MANAGER]: [...OPERATION_PERMISSIONS],
};

export function hasPermission(
  role: UserRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.includes(permission) : false;
}

export function hasAnyPermission(
  role: UserRole | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/** Convenience predicate for the most common gate. */
export const canAccessSettings = (role: UserRole | null | undefined): boolean =>
  hasPermission(role, Permission.ACCESS_SETTINGS);

/** Convenience predicate for cross-branch reads (admin & owner). */
export const canAccessAllBranches = (role: UserRole | null | undefined): boolean =>
  hasPermission(role, Permission.CROSS_BRANCH_ACCESS);

/** Convenience predicate: can write to a CLOSED inventory period. */
export const canBypassClosedPeriod = (role: UserRole | null | undefined): boolean =>
  hasPermission(role, Permission.BYPASS_CLOSED_PERIOD);
