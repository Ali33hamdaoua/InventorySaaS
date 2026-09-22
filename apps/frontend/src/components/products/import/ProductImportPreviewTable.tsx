import type {
  ProductImportInactiveAction,
  ProductImportRow,
} from '@inventorymdb/shared';
import { ProductImportStatusBadge } from './ProductImportStatusBadge';
import { cn, currency } from '@/lib/utils';

interface Props {
  rows: ProductImportRow[];
  /** Appelé quand l'utilisateur change la décision pour une ligne
   *  INACTIVE_MATCH. Facultatif : sans ce handler, la table est en lecture
   *  seule (les décisions ne peuvent pas être modifiées et le confirm
   *  ignorera par défaut). */
  onInactiveActionChange?: (
    rowNumber: number,
    action: ProductImportInactiveAction,
  ) => void;
}

export function ProductImportPreviewTable({ rows, onInactiveActionChange }: Props) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
          <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-2 py-2 text-center font-medium">#</th>
            <th className="px-2 py-2 font-medium">Produit</th>
            <th className="px-2 py-2 font-medium">Catégorie</th>
            <th className="px-2 py-2 font-medium">Fournisseur</th>
            <th className="px-2 py-2 text-center font-medium">Unité</th>
            <th className="px-2 py-2 text-right font-medium">Coût u.</th>
            <th className="px-2 py-2 text-right font-medium">Seuil min</th>
            <th className="px-2 py-2 font-medium">Statut</th>
            <th className="px-2 py-2 font-medium">Messages</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.rowNumber}
              className={cn(
                'border-b border-border/40 last:border-0',
                r.status === 'ERROR' && 'bg-destructive/[0.04]',
                r.status === 'WARNING' && 'bg-amber-500/[0.04]',
                r.status === 'INACTIVE_MATCH' && 'bg-amber-500/[0.06]',
              )}
            >
              <td className="px-2 py-2 text-center text-muted-foreground tabular-nums">
                {r.rowNumber}
              </td>
              <td className="px-2 py-2 font-medium">{r.data.name || '—'}</td>
              <td className="px-2 py-2">
                {r.data.category || <span className="text-muted-foreground">—</span>}
                {r.matchedCategoryId && (
                  <span className="ml-1 text-[10px] text-emerald-600">✓</span>
                )}
              </td>
              <td className="px-2 py-2">
                {r.data.supplier ? (
                  <>
                    {r.data.supplier}
                    {r.matchedSupplierId && (
                      <span className="ml-1 text-[10px] text-emerald-600">✓</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-2 py-2 text-center text-muted-foreground">
                {r.data.unit || '—'}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {currency.format(r.data.defaultCost)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                {r.data.minStockLevel}
              </td>
              <td className="px-2 py-2">
                <ProductImportStatusBadge status={r.status} />
                {r.existingProductId && r.status !== 'INACTIVE_MATCH' && (
                  <div className="mt-1 text-[10px] text-muted-foreground">↻ Mise à jour</div>
                )}
                {r.status === 'INACTIVE_MATCH' && (
                  <div className="mt-1 text-[10px] font-medium text-amber-600">
                    Décision requise
                  </div>
                )}
              </td>
              <td className="px-2 py-2">
                {r.errors.length > 0 && (
                  <ul className="space-y-0.5">
                    {r.errors.map((e, i) => (
                      <li key={i} className="text-[10px] text-destructive">
                        ✕ {e.message}
                      </li>
                    ))}
                  </ul>
                )}
                {r.warnings.length > 0 && (
                  <ul className="space-y-0.5">
                    {r.warnings.map((w, i) => (
                      <li key={i} className="text-[10px] text-amber-400">
                        ! {w.message}
                      </li>
                    ))}
                  </ul>
                )}
                {r.status === 'INACTIVE_MATCH' && r.inactiveMatch && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-amber-600">
                      ⚠ {r.inactiveMatch.warning}
                    </p>
                    {/* Radios — décision explicite. Default = IGNORE (aligné
                        backend : sans action explicite le confirm ignore
                        cette ligne, aucune réactivation silencieuse). */}
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-1.5 text-[10px]">
                        <input
                          type="radio"
                          name={`inactive-${r.rowNumber}`}
                          className="h-3 w-3 accent-muted-foreground"
                          checked={(r.inactiveAction ?? 'IGNORE') === 'IGNORE'}
                          onChange={() => onInactiveActionChange?.(r.rowNumber, 'IGNORE')}
                          disabled={!onInactiveActionChange}
                        />
                        <span>Ignorer (défaut — aucun changement)</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px]">
                        <input
                          type="radio"
                          name={`inactive-${r.rowNumber}`}
                          className="h-3 w-3 accent-[hsl(var(--primary))]"
                          checked={r.inactiveAction === 'REACTIVATE_AND_UPDATE'}
                          onChange={() =>
                            onInactiveActionChange?.(r.rowNumber, 'REACTIVATE_AND_UPDATE')
                          }
                          disabled={!onInactiveActionChange}
                        />
                        <span>Réactiver et mettre à jour</span>
                      </label>
                    </div>
                  </div>
                )}
                {r.status === 'VALID' && (
                  <span className="text-[10px] text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
