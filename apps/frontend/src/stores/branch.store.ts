import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SelectedBranch {
  id: string;
  slug: string;
  name: string;
}

interface BranchState {
  /** Currently active branch — null when the user hasn't picked any yet. */
  selectedBranchId: string | null;
  selectedBranchSlug: string | null;
  selectedBranchName: string | null;
  setSelectedBranch: (branch: SelectedBranch) => void;
  clear: () => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      selectedBranchId: null,
      selectedBranchSlug: null,
      selectedBranchName: null,
      setSelectedBranch: (branch) =>
        set({
          selectedBranchId: branch.id,
          selectedBranchSlug: branch.slug,
          selectedBranchName: branch.name,
        }),
      clear: () =>
        set({
          selectedBranchId: null,
          selectedBranchSlug: null,
          selectedBranchName: null,
        }),
    }),
    { name: 'inventorymdb-branch' },
  ),
);
