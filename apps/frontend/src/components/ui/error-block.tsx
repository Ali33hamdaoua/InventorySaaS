import { AlertCircle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorBlockProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

export function ErrorBlock({
  title = 'Impossible de charger les données',
  description = 'Une erreur est survenue. Réessayez dans un instant.',
  onRetry,
  retrying,
  className,
}: ErrorBlockProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-center',
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertCircle className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
          <RotateCw className={cn('mr-2 h-3.5 w-3.5', retrying && 'animate-spin')} />
          Réessayer
        </Button>
      )}
    </div>
  );
}
