import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { branchesService, type Branch } from '@/services/branches.service';
import { useBranchStore } from '@/stores/branch.store';

/**
 * Returns the currently active branch plus the list of available branches.
 *
 * - Auto-selects the first active branch on first load (or when the persisted
 *   branchId disappears from the server, e.g. the user's local cache pointed
 *   to a deactivated branch).
 * - Re-validates the stored selection against the server every time the list
 *   refetches so stale local data is corrected automatically.
 */
export function useActiveBranch() {
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  const selectedBranch = useBranchStore((s) => ({
    id: s.selectedBranchId,
    slug: s.selectedBranchSlug,
    name: s.selectedBranchName,
  }));
  const setSelectedBranch = useBranchStore((s) => s.setSelectedBranch);

  const branchesQuery = useQuery({
    queryKey: ['branches', 'active'],
    queryFn: () => branchesService.list({ includeInactive: false }),
    staleTime: 5 * 60_000,
  });

  const branches: Branch[] = branchesQuery.data ?? [];

  // Sync: if no selection or the selection points to a branch that no longer
  // exists / is inactive, pick the first active branch as a sensible default.
  useEffect(() => {
    if (branchesQuery.isLoading || branches.length === 0) return;
    const stillValid = selectedBranchId && branches.some((b) => b.id === selectedBranchId);
    if (!stillValid) {
      const fallback = branches[0];
      if (fallback) {
        setSelectedBranch({ id: fallback.id, slug: fallback.slug, name: fallback.name });
      }
    }
  }, [branchesQuery.isLoading, branches, selectedBranchId, setSelectedBranch]);

  const branch =
    branches.find((b) => b.id === selectedBranchId) ??
    (selectedBranch.id && selectedBranch.name && selectedBranch.slug
      ? ({
          id: selectedBranch.id,
          name: selectedBranch.name,
          slug: selectedBranch.slug,
          address: null,
          isActive: true,
          createdAt: '',
          updatedAt: '',
        } satisfies Branch)
      : null);

  return {
    /** Active branchId (null while the list hasn't loaded for the first time). */
    branchId: selectedBranchId,
    /** Full active branch object, or null. */
    branch,
    /** All active branches. */
    branches,
    isLoading: branchesQuery.isLoading,
    isError: branchesQuery.isError,
  };
}
