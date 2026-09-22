import { Badge } from '@/components/ui/badge';

export function UserStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="success" className="whitespace-nowrap">
      ● Actif
    </Badge>
  ) : (
    <Badge variant="outline" className="whitespace-nowrap">
      ○ Désactivé
    </Badge>
  );
}
