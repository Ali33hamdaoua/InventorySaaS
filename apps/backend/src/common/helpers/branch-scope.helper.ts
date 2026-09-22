import { ForbiddenException } from '@nestjs/common';
import { canAccessAllBranches } from '@inventorymdb/shared';
import type { RequestUser } from '../decorators/current-user.decorator';

/**
 * Multi-branch access control. Resolves *which* branch(es) the current user
 * is allowed to read from a list endpoint, taking into account:
 *
 *  - ADMIN / OWNER → may read any branch. Their `requestedBranchId` is
 *    honoured if provided; otherwise the result is "all branches" (`null`).
 *  - MANAGER       → locked to their assigned `user.branchId`. A request for
 *    another branch is rejected with 403. Missing `user.branchId` (data
 *    integrity issue) also yields 403.
 *
 * Returns the branchId to inject into the Prisma `where` clause, or `null`
 * to mean "no scope" (read across all branches — admin only).
 */
export function resolveBranchScope(
  user: RequestUser | undefined,
  requestedBranchId?: string | null,
): string | null {
  if (!user) {
    // Should never happen with JwtAuthGuard, but be defensive.
    if (!requestedBranchId) return null;
    return requestedBranchId;
  }

  const isPrivileged = canAccessAllBranches(user.role);

  if (isPrivileged) {
    return requestedBranchId ?? null;
  }

  // MANAGER (and any future scoped role)
  if (!user.branchId) {
    throw new ForbiddenException(
      "Cet utilisateur n'est rattaché à aucune succursale.",
    );
  }
  if (requestedBranchId && requestedBranchId !== user.branchId) {
    throw new ForbiddenException(
      "Vous n'avez pas accès à cette succursale.",
    );
  }
  return user.branchId;
}

/**
 * For *mutations* (create), the branchId MUST be known.
 * - MANAGER → forced to their `user.branchId`.
 * - ADMIN / OWNER → must pass an explicit `requestedBranchId`.
 *
 * Throws 403 if a MANAGER tries to act on another branch, or if no branch
 * can be determined.
 */
export function resolveBranchForMutation(
  user: RequestUser | undefined,
  requestedBranchId?: string | null,
): string {
  if (!user) {
    if (!requestedBranchId) {
      throw new ForbiddenException('Branche cible requise.');
    }
    return requestedBranchId;
  }

  const isPrivileged = canAccessAllBranches(user.role);

  if (isPrivileged) {
    if (!requestedBranchId) {
      throw new ForbiddenException(
        "Vous devez préciser la branche (branchId) — votre compte a accès à toutes les succursales.",
      );
    }
    return requestedBranchId;
  }

  if (!user.branchId) {
    throw new ForbiddenException(
      "Cet utilisateur n'est rattaché à aucune succursale.",
    );
  }
  if (requestedBranchId && requestedBranchId !== user.branchId) {
    throw new ForbiddenException(
      "Vous n'avez pas accès à cette succursale.",
    );
  }
  return user.branchId;
}
