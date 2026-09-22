import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchesService, type BranchPayload } from '@/services/branches.service';

const BRANCHES_KEY = ['branches'] as const;

/** Settings tab — list every branch (active + inactive) with usage stats. */
export function useAllBranches() {
  return useQuery({
    queryKey: [...BRANCHES_KEY, 'all-with-stats'],
    queryFn: () =>
      branchesService.list({ includeInactive: true, includeStats: true }),
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: BRANCHES_KEY });
  // Many list queries (products, purchases, periods, accounting) depend on
  // the active-branch list. Invalidate them too so a deactivation cascades.
  qc.invalidateQueries({ queryKey: ['products'] });
  qc.invalidateQueries({ queryKey: ['purchases'] });
  qc.invalidateQueries({ queryKey: ['inventory-periods'] });
  qc.invalidateQueries({ queryKey: ['accounting'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BranchPayload) => branchesService.create(data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BranchPayload> }) =>
      branchesService.update(id, data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetBranchStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? branchesService.activate(id) : branchesService.deactivate(id),
    onSuccess: () => invalidateAll(qc),
  });
}
