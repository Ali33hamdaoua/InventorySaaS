import { Crown, Shield, User as UserIcon } from 'lucide-react';
import type { UserRole } from '@inventorymdb/shared';
import { Badge } from '@/components/ui/badge';

const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
};

export function UserRoleBadge({ role }: { role: UserRole }) {
  if (role === 'OWNER') {
    return (
      <Badge variant="primary" className="gap-1 whitespace-nowrap">
        <Crown className="h-3 w-3" />
        {ROLE_LABEL.OWNER}
      </Badge>
    );
  }
  if (role === 'ADMIN') {
    return (
      <Badge variant="warning" className="gap-1 whitespace-nowrap">
        <Shield className="h-3 w-3" />
        {ROLE_LABEL.ADMIN}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap">
      <UserIcon className="h-3 w-3" />
      {ROLE_LABEL.MANAGER}
    </Badge>
  );
}
