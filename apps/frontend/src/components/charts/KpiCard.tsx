import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type DeltaPolarity = 'positive' | 'negative' | 'neutral';

interface KpiCardProps {
  title: string;
  value: string;
  hint?: string;
  /** Pre-formatted delta string (e.g. "+12.4 %", "-3.1 pp"). null/undefined → not displayed. */
  delta?: string | null;
  /** Numeric polarity of the delta, drives colour and icon. */
  deltaPolarity?: DeltaPolarity;
  /** Optional contextual sentence (browser tooltip). */
  tooltip?: string;
  className?: string;
  icon?: React.ReactNode;
  accent?: boolean;
}

const polarityClass: Record<DeltaPolarity, string> = {
  positive: 'text-emerald-600 bg-emerald-500/10',
  negative: 'text-destructive bg-destructive/10',
  neutral: 'text-muted-foreground bg-[var(--subtle-overlay)]',
};

const polarityIcon: Record<DeltaPolarity, React.ReactNode> = {
  positive: <TrendingUp className="h-3 w-3" />,
  negative: <TrendingDown className="h-3 w-3" />,
  neutral: <Minus className="h-3 w-3" />,
};

export function KpiCard({
  title,
  value,
  hint,
  delta,
  deltaPolarity = 'neutral',
  tooltip,
  className,
  icon,
  accent,
}: KpiCardProps) {
  return (
    <Card
      className={cn(
        'group relative overflow-hidden border-border/60 bg-card transition-colors hover:border-primary/40',
        className,
      )}
      title={tooltip}
    >
      {accent && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary via-primary/60 to-transparent"
        />
      )}
      <CardContent className="flex h-full flex-col gap-3 p-5">
        {/* Row 1 — title + icon */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-medium uppercase leading-tight tracking-[0.14em] text-muted-foreground">
            {title}
          </span>
          {icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              {icon}
            </span>
          )}
        </div>

        {/* Row 2 — value (full width, never squeezed) */}
        <div
          className="text-[1.625rem] font-semibold leading-none tracking-tight tabular-nums text-foreground"
          title={tooltip}
        >
          {value}
        </div>

        {/* Row 3 — delta chip + hint (auto-pushed to bottom) */}
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {delta && (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
                polarityClass[deltaPolarity],
              )}
              title="Variation vs mois précédent"
            >
              {polarityIcon[deltaPolarity]}
              {delta}
            </span>
          )}
          {hint && (
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
