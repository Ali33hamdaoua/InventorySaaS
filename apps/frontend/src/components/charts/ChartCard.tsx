import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  description?: string;
  /** Render in loading state. */
  loading?: boolean;
  /** Render an error block. */
  error?: boolean;
  /** Render the empty state when there is no data. */
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  /** Inner height used for skeleton and empty placeholders. */
  innerHeight?: number;
  className?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  description,
  loading,
  error,
  empty,
  emptyTitle = 'Aucune donnée à afficher',
  emptyDescription = 'Les données apparaîtront ici dès qu\'elles seront disponibles.',
  emptyIcon,
  onRetry,
  retrying,
  innerHeight = 280,
  className,
  action,
  children,
}: ChartCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorBlock onRetry={onRetry} retrying={retrying} className="my-2" />
        ) : loading ? (
          <Skeleton style={{ height: innerHeight }} className="w-full" />
        ) : empty ? (
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            icon={emptyIcon}
            className="my-2"
            compact
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
