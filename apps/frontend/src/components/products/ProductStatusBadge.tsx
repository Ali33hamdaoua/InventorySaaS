import { Badge } from '@/components/ui/badge';

export function ProductStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="success">● Actif</Badge>
  ) : (
    <Badge variant="outline">○ Inactif</Badge>
  );
}
