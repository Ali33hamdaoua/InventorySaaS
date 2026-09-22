import { Badge } from '@/components/ui/badge';

export function CategoryStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="success">● Actif</Badge>
  ) : (
    <Badge variant="outline">○ Inactif</Badge>
  );
}
