import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface OwnerSummaryCardProps {
  summary?: string;
  loading?: boolean;
}

export function OwnerSummaryCard({ summary, loading }: OwnerSummaryCardProps) {
  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary via-primary/60 to-transparent"
      />
      <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:gap-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            Lecture rapide owner
          </p>
          {loading || !summary ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
