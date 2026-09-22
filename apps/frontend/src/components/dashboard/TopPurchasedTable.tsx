import { ShoppingCart, Info } from 'lucide-react';
import type { TopPurchasedProduct } from '@inventorymdb/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { currency } from '@/lib/utils';

interface Props {
  products: TopPurchasedProduct[] | undefined;
  loading?: boolean;
}

export function TopPurchasedTable({ products, loading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="h-4 w-4 text-primary" />
          Top produits achetés
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Triés par valeur d'achat — basé sur les factures fournisseurs du mois.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40" />
        ) : !products || products.length === 0 ? (
          <EmptyState
            title="Aucun achat enregistré ce mois"
            description="Saisissez des bons d'achat pour voir le top apparaître ici."
            compact
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="pb-2 font-medium">Produit</th>
                    <th className="pb-2 font-medium">Catégorie</th>
                    <th className="pb-2 font-medium">Quantité</th>
                    <th className="pb-2 text-right font-medium">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr
                      key={p.productId}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="max-w-[260px] truncate py-3 pr-4" title={p.productName}>
                        {p.productName}
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {p.categoryName ?? '—'}
                      </td>
                      <td className="whitespace-nowrap py-3 tabular-nums text-muted-foreground">
                        {p.quantityPurchased} {p.unit}
                      </td>
                      <td className="whitespace-nowrap py-3 text-right font-medium tabular-nums">
                        {currency.format(p.totalPurchasedValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Basé sur les achats facturés, pas sur des ventes ou de la consommation.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
