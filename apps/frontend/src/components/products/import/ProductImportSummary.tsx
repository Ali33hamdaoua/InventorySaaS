import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Plus,
  PowerOff,
  RefreshCw,
} from 'lucide-react';
import type { ProductImportSummary } from '@inventorymdb/shared';
import { cn } from '@/lib/utils';

interface Props {
  summary: ProductImportSummary;
}

export function ProductImportSummary({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <Stat
        icon={<FileText className="h-3.5 w-3.5" />}
        label="Total"
        value={summary.totalRows}
      />
      <Stat
        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        label="Valides"
        value={summary.validRows}
        tone="success"
      />
      <Stat
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        label="Avertis."
        value={summary.warningRows}
        tone="warning"
      />
      <Stat
        icon={<XCircle className="h-3.5 w-3.5" />}
        label="Erreurs"
        value={summary.errorRows}
        tone="danger"
      />
      <Stat
        icon={<Plus className="h-3.5 w-3.5" />}
        label="Créations"
        value={summary.createCount}
        tone="primary"
      />
      <Stat
        icon={<RefreshCw className="h-3.5 w-3.5" />}
        label="Mises à jour"
        value={summary.updateCount}
        tone="primary"
      />
      <Stat
        icon={<PowerOff className="h-3.5 w-3.5" />}
        label="Inactifs matchés"
        value={summary.inactiveMatchRows}
        tone="warning"
      />
      <Stat
        icon={<RefreshCw className="h-3.5 w-3.5" />}
        label="Réactivations"
        value={summary.reactivatedCount}
        tone="warning"
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary';
}) {
  const toneClasses: Record<string, string> = {
    neutral: 'text-foreground',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-destructive',
    primary: 'text-primary',
  };
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span className={cn(toneClasses[tone])}>{icon}</span>
        {label}
      </div>
      <div
        className={cn('mt-1 text-lg font-semibold tabular-nums', toneClasses[tone])}
      >
        {value}
      </div>
    </div>
  );
}
