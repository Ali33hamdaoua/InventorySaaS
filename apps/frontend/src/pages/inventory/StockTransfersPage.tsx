import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { stockTransfersService } from '@/services/stock-transfers.service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBlock } from '@/components/ui/error-block';
import { formatNumber, toNumber } from '@/lib/utils';
import { STOCK_TRANSFER_STATUS_LABEL } from '@inventorymdb/shared';

export default function StockTransfersPage() {
  const { data: transfers, isLoading, isError, refetch } = useQuery({
    queryKey: ['stock-transfers'],
    queryFn: () => stockTransfersService.findAll(),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Transferts de stock</h1>
        <p className="text-muted-foreground mt-1">Historique des transferts de stock entre les succursales.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Historique récent</CardTitle>
          <CardDescription>Consultez les mouvements de stock inter-succursales.</CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <ErrorBlock
              title="Impossible de charger l'historique"
              onRetry={() => refetch()}
              retrying={isLoading}
            />
          ) : isLoading ? (
            <div className="flex justify-center p-8">
              <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !transfers || transfers.length === 0 ? (
            <EmptyState
              title="Aucun transfert"
              description="Aucun mouvement de stock entre succursales n'a été enregistré."
              icon={<ArrowLeftRight className="h-5 w-5" />}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-3 pb-2 font-medium">Date</th>
                    <th className="px-3 pb-2 font-medium">Source</th>
                    <th className="px-3 pb-2 font-medium">Destination</th>
                    <th className="px-3 pb-2 font-medium">Produit(s)</th>
                    <th className="px-3 pb-2 font-medium text-right">Quantité</th>
                    <th className="px-3 pb-2 font-medium">Auteur</th>
                    <th className="px-3 pb-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => (
                    <tr key={t.id} className="border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                        {format(new Date(t.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {t.fromBranch?.name || 'Inconnue'}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {t.toBranch?.name || 'Inconnue'}
                      </td>
                      <td className="px-3 py-3 max-w-[200px] truncate" title={t.note || undefined}>
                        {t.items.map((i) => i.sourceProduct?.name).join(', ')}
                        {t.note && <span className="block text-xs text-muted-foreground truncate">{t.note}</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {t.items.map((i) => (
                          <div key={i.id}>
                            {formatNumber(toNumber(i.quantity), 2)} <span className="text-xs text-muted-foreground">{i.sourceProduct?.unit}</span>
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {t.createdBy?.name || 'Système'}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={t.status === 'COMPLETED' ? 'success' : 'default'}>
                          {STOCK_TRANSFER_STATUS_LABEL[t.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
