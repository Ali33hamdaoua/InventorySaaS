import { useMemo } from 'react';
import {
  hasPermission,
  hasAnyPermission,
  canAccessSettings,
  canAccessAllBranches,
  canBypassClosedPeriod,
  Permission,
  type UserRole,
} from '@inventorymdb/shared';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Frontend mirror of the shared permission map. Components MUST call these
 * hooks instead of comparing `user.role` directly — that way the backend
 * `PermissionsGuard` and frontend UI stay in lockstep.
 *
 * Note: this is UX gating only — the backend is the authoritative check.
 * Showing/hiding a menu item without backend enforcement is not security.
 */

export { Permission };
export type { UserRole };

/** Reactive single-permission check, scoped to the current user's role. */
export function useHasPermission(permission: Permission): boolean {
  const role = useAuthStore((s) => s.user?.role ?? null);
  return useMemo(() => hasPermission(role, permission), [role, permission]);
}

/** Reactive any-of check. Stable array reference recommended to avoid rerenders. */
export function useHasAnyPermission(permissions: readonly Permission[]): boolean {
  const role = useAuthStore((s) => s.user?.role ?? null);
  return useMemo(() => hasAnyPermission(role, permissions), [role, permissions]);
}

/** Convenience: the Settings gate is checked often enough to deserve its own hook. */
export function useCanAccessSettings(): boolean {
  const role = useAuthStore((s) => s.user?.role ?? null);
  return useMemo(() => canAccessSettings(role), [role]);
}

// Re-export the pure helpers so non-hook code (e.g. router loaders) can use them.
export { hasPermission, hasAnyPermission, canAccessSettings, canAccessAllBranches, canBypassClosedPeriod };
