import { FileSpreadsheet, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onDownloadTemplate: () => Promise<void> | void;
  downloading?: boolean;
}

const COLUMNS = [
  { name: 'name', required: true, hint: 'Nom du produit (utilisé pour détecter create vs update, insensible à la casse)' },
  { name: 'category', required: true, hint: 'Nom EXACT d\'une catégorie existante' },
  { name: 'supplier', required: false, hint: 'Nom EXACT d\'un fournisseur existant (optionnel)' },
  { name: 'unit', required: true, hint: 'kg, g, L, ml, unit, box, pack, bag' },
  { name: 'defaultCost', required: true, hint: 'Nombre ≥ 0 (CAD)' },
  { name: 'minStockLevel', required: false, hint: 'Nombre ≥ 0 (défaut 0)' },
  { name: 'isActive', required: false, hint: 'true / false / oui / non (défaut true)' },
];

export function ProductImportInstructions({ onDownloadTemplate, downloading }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Template Excel</p>
            <p className="text-xs text-muted-foreground">
              Téléchargez le template, remplissez vos produits, puis revenez ici pour l'importer.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onDownloadTemplate()}
          disabled={downloading}
          className="gap-2"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-3.5 w-3.5" />
          )}
          Télécharger le template
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Colonnes attendues
        </p>
        <div className="overflow-hidden rounded-md border border-border/60">
          <table className="w-full text-xs">
            <thead className="bg-background/40">
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-3 py-2">Colonne</th>
                <th className="px-3 py-2">Requise</th>
                <th className="px-3 py-2">Détails</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((c) => (
                <tr key={c.name} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-2 font-mono text-[11px]">{c.name}</td>
                  <td className="px-3 py-2">
                    {c.required ? (
                      <span className="text-primary">●</span>
                    ) : (
                      <span className="text-muted-foreground">○</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{c.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <p className="text-muted-foreground">
          <strong className="text-foreground">Catégories et fournisseurs</strong> doivent
          déjà exister. Créez-les via leurs pages respectives avant l'import. Les produits
          au <strong className="text-foreground">même nom</strong> (insensible à la casse,
          dans la même succursale) seront mis à jour ; les nouveaux seront créés.
        </p>
      </div>
    </div>
  );
}
