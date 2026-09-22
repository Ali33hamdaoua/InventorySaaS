import { Building2, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  branch: { name: string; slug: string } | null;
}

/**
 * "Toutes les succursales" when branch is null (OWNER/ADMIN cross-branch),
 * otherwise show the assigned branch name.
 */
export function UserBranchBadge({ branch }: Props) {
  if (!branch) {
    return (
      <Badge variant="primary" className="gap-1 whitespace-nowrap">
        <Globe className="h-3 w-3" />
        Toutes
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap">
      <Building2 className="h-3 w-3" />
      {branch.name}
    </Badge>
  );
}
