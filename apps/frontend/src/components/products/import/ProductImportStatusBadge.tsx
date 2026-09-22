import { AlertTriangle, CheckCircle2, PowerOff, XCircle } from 'lucide-react';
import type { ProductImportStatus } from '@inventorymdb/shared';
import { Badge } from '@/components/ui/badge';

export function ProductImportStatusBadge({ status }: { status: ProductImportStatus }) {
  if (status === 'VALID') {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Valide
      </Badge>
    );
  }
  if (status === 'WARNING') {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Avertissement
      </Badge>
    );
  }
  if (status === 'INACTIVE_MATCH') {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-600"
      >
        <PowerOff className="h-3 w-3" />
        Inactif existant
      </Badge>
    );
  }
  return (
    <Badge variant="danger" className="gap-1">
      <XCircle className="h-3 w-3" />
      Erreur
    </Badge>
  );
}
