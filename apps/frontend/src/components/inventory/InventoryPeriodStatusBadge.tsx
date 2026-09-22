import { Lock, Unlock } from 'lucide-react';
import type { PeriodStatus } from '@inventorymdb/shared';
import { Badge } from '@/components/ui/badge';

export function InventoryPeriodStatusBadge({ status }: { status: PeriodStatus }) {
  return status === 'OPEN' ? (
    <Badge variant="primary" className="gap-1">
      <Unlock className="h-3 w-3" />
      Ouverte
    </Badge>
  ) : (
    <Badge variant="success" className="gap-1">
      <Lock className="h-3 w-3" />
      Clôturée
    </Badge>
  );
}
