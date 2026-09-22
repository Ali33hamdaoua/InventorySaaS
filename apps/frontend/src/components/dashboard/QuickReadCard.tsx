import { BookOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Honest, non-misleading explanation of what the dashboard actually shows
 * (and what it doesn't). Replaces the previous "Lecture rapide owner" which
 * mixed real and estimated figures.
 */
export function QuickReadCard() {
  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary via-primary/60 to-transparent"
      />
      <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:gap-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            Lecture rapide
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">
            Ce dashboard est basé sur les <strong>achats</strong> et les{' '}
            <strong>inventaires saisis</strong> mois par mois. Les chiffres ne sont{' '}
            <strong>pas</strong> issus des ventes en temps réel.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Utilisez ces indicateurs pour piloter le coût mensuel : début + achats − fin =
            cost réel. Le « food cost % » apparaît seulement quand vous renseignez le chiffre
            d'affaires à la clôture.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
