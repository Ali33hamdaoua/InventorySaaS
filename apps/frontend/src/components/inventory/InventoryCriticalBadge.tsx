import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function InventoryCriticalBadge({ critical }: { critical: boolean }) {
  if (!critical) return null;
  return (
    <Badge variant="danger" className="gap-1">
      <AlertTriangle className="h-3 w-3" />
      Critique
    </Badge>
  );
}
