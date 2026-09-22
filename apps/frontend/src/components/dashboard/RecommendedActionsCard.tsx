import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, CheckCircle2, Info } from 'lucide-react';
import type { RecommendedAction, RecommendedActionSeverity } from '@inventorymdb/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const severityStyle: Record<RecommendedActionSeverity, { icon: JSX.Element; chip: string; row: string }> = {
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    chip: 'bg-amber-500/15 text-amber-400',
    row: 'hover:bg-amber-500/[0.04]',
  },
  info: {
    icon: <Info className="h-4 w-4" />,
    chip: 'bg-sky-500/15 text-sky-400',
    row: 'hover:bg-sky-500/[0.04]',
  },
  success: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    chip: 'bg-emerald-500/15 text-emerald-400',
    row: 'hover:bg-emerald-500/[0.04]',
  },
};

interface Props {
  actions?: RecommendedAction[];
  loading?: boolean;
}

export function RecommendedActionsCard({ actions, loading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actions recommandées</CardTitle>
        <p className="text-xs text-muted-foreground">Les prochaines étapes pour rester maître de votre food cost.</p>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : !actions || actions.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Aucune action recommandée.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {actions.map((a) => {
              const style = severityStyle[a.severity];
              const Row = (
                <div className={cn('flex items-start gap-3 px-6 py-3.5 transition-colors', style.row)}>
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                      style.chip,
                    )}
                  >
                    {style.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{a.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.description}</p>
                  </div>
                  {a.ctaPath && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
                      {a.ctaLabel ?? 'Ouvrir'}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              );
              return (
                <li key={a.id}>
                  {a.ctaPath ? (
                    <Link to={a.ctaPath} className="group block">
                      {Row}
                    </Link>
                  ) : (
                    Row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
