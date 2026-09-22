import { AlertTriangle, Info, PackageX } from 'lucide-react';
import type { WatchProduct } from '@inventorymdb/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  products: WatchProduct[] | undefined;
  loading?: boolean;
}

export function WatchProductsList({ products, loading }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-primary" />
            Produits à surveiller
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Sous le seuil minimum lors du dernier inventaire saisi.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : !products || products.length === 0 ? (
          <EmptyState
            title="Aucun produit en alerte"
            description="Tous les stocks finaux saisis sont au-dessus du seuil minimum."
            icon={<PackageX className="h-4 w-4" />}
            compact
          />
        ) : (
          <>
            <ul className="space-y-3">
              {products.slice(0, 8).map((p) => (
                <li
                  key={p.productId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate pr-2">{p.productName}</span>
                  <Badge variant="danger">
                    {p.closingQuantity} / {p.minStockLevel} {p.unit}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Basé sur l'inventaire final saisi, pas sur un stock temps réel.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
