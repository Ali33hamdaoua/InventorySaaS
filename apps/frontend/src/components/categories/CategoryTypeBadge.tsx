import { AlertTriangle, Apple, Box, SprayCan } from 'lucide-react';
import type { CategoryType } from '@inventorymdb/shared';
import { Badge } from '@/components/ui/badge';

/**
 * Visual cue for a category's cost family. The 3 active families
 * (FOOD / PAPER / CLEANING) get a colored badge with a thematic icon ;
 * legacy `NON_FOOD` rows display a warning badge so the admin reclassifies
 * them — they still feed the calc (fallback to Paper) but ideally don't
 * stay on a fresh DB.
 */
export function CategoryTypeBadge({ type }: { type: CategoryType }) {
  if (type === 'FOOD') {
    return (
      <Badge variant="success" className="gap-1">
        <Apple className="h-3 w-3" />
        Food
      </Badge>
    );
  }
  if (type === 'PAPIERS') {
    return (
      <Badge
        className="gap-1 border-transparent bg-amber-500/20 text-amber-300 hover:bg-amber-500/25"
        title="Paper Cost — emballages, sacs, gobelets…"
      >
        <Box className="h-3 w-3" />
        Paper
      </Badge>
    );
  }
  if (type === 'NETTOYAGE') {
    return (
      <Badge
        className="gap-1 border-transparent bg-sky-500/20 text-sky-300 hover:bg-sky-500/25"
        title="Cleaning Cost — savon, désinfectant, nettoyants…"
      >
        <SprayCan className="h-3 w-3" />
        Cleaning
      </Badge>
    );
  }
  // NON_FOOD legacy : warning. Indique à l'admin qu'il doit reclasser.
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-500/40 text-amber-400"
      title="Catégorie legacy — à reclasser en Food / Paper / Cleaning. Temporairement comptée comme Paper Cost."
    >
      <AlertTriangle className="h-3 w-3" />
      Non-food
    </Badge>
  );
}
